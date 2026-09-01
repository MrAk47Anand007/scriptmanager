import { WebSocketServer, WebSocket } from 'ws';
import type { IPty } from 'node-pty';
import { Server } from 'http';
import os from 'os';
import { URL } from 'url';
import fs from 'fs';
import { isAuthenticatedCookieHeader } from '@/lib/session';
import { getDesktopWorkspaceLayout } from '@/lib/workspaceLayout';
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext';
import { permissionAllows } from '@/lib/rbac/authorization';
import { prisma } from '@/lib/db';

interface TerminalSession {
    process: IPty;
    sockets: Set<WebSocket>;
    idleTimer: ReturnType<typeof setTimeout> | null;
}

const sessionsByKey = new Map<string, TerminalSession>();
const socketToSessionKey = new Map<WebSocket, string>();
const sessionsStartingByKey = new Map<string, Promise<TerminalSession>>();
let ptyModulePromise: Promise<typeof import('node-pty')> | null = null;
const TERMINAL_IDLE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TERMINAL_SESSION_ID = 'terminal-1';

function loadPtyModule() {
    ptyModulePromise ??= import('node-pty');
    return ptyModulePromise.catch((error) => {
        ptyModulePromise = null;
        throw error;
    });
}

function getUserSessionKey(cookieHeader?: string): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)sm_session=([^;]+)/);
    return match?.[1] ?? null;
}

function normalizeTerminalSessionId(sessionId?: string | null): string {
    const trimmed = sessionId?.trim();
    return trimmed || DEFAULT_TERMINAL_SESSION_ID;
}

function getSessionKey(cookieHeader?: string, terminalSessionId?: string | null): string | null {
    const userSessionKey = getUserSessionKey(cookieHeader);
    if (!userSessionKey) {
        return null;
    }

    return `${userSessionKey}::${normalizeTerminalSessionId(terminalSessionId)}`;
}

function getDefaultTerminalCwd() {
    const configured = process.env.SCRIPTS_DIR || `${process.cwd()}/user_scripts`;
    const target = getDesktopWorkspaceLayout(configured).scriptsRoot;

    try {
        fs.mkdirSync(target, { recursive: true });
        return target;
    } catch {
        return process.cwd();
    }
}

async function createPtyProcess() {
    const pty = await loadPtyModule();
    const isWindows = os.platform() === 'win32';
    const env = {
        ...(process.env as { [key: string]: string }),
        TERM: 'xterm-256color',
    };

    const candidates = isWindows
        ? [
            { shell: 'pwsh.exe', args: ['-NoLogo'] },
            { shell: 'powershell.exe', args: ['-NoLogo'] },
            { shell: 'cmd.exe', args: [] },
        ]
        : [
            { shell: process.env.SHELL || 'bash', args: [] },
            { shell: 'bash', args: [] },
            { shell: 'sh', args: [] },
        ];

    let lastError: unknown = null;

    for (const candidate of candidates) {
        try {
            return pty.spawn(candidate.shell, candidate.args, {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: getDefaultTerminalCwd(),
                env,
                useConpty: false,
            });
        } catch (err) {
            lastError = err;
            console.warn(`[Terminal] Failed to spawn ${candidate.shell}, trying fallback:`, err);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to start terminal shell');
}

function destroySession(sessionKey: string) {
    const session = sessionsByKey.get(sessionKey);
    if (!session) return;

    session.idleTimer && clearTimeout(session.idleTimer);
    session.idleTimer = null;
    session.process.kill();
    sessionsByKey.delete(sessionKey);
}

function scheduleSessionCleanup(sessionKey: string) {
    const session = sessionsByKey.get(sessionKey);
    if (!session || session.sockets.size > 0 || session.idleTimer) return;

    session.idleTimer = setTimeout(() => {
        const latest = sessionsByKey.get(sessionKey);
        if (!latest || latest.sockets.size > 0) return;
        console.log('[Terminal] Closing idle terminal session');
        destroySession(sessionKey);
    }, TERMINAL_IDLE_TTL_MS);
}

async function ensureTerminalSession(sessionKey: string): Promise<TerminalSession> {
    const existing = sessionsByKey.get(sessionKey);
    if (existing) {
        if (existing.idleTimer) {
            clearTimeout(existing.idleTimer);
            existing.idleTimer = null;
        }
        return existing;
    }

    const starting = sessionsStartingByKey.get(sessionKey);
    if (starting) return starting;

    const startup = (async () => {
        const ptyProcess = await createPtyProcess();
        const session: TerminalSession = {
            process: ptyProcess,
            sockets: new Set<WebSocket>(),
            idleTimer: null,
        };

        ptyProcess.onData((data) => {
            for (const socket of session.sockets) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(data);
                }
            }
        });

        ptyProcess.onExit(() => {
            console.warn('[Terminal] PTY session exited');
            for (const socket of session.sockets) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.close();
                }
            }
            sessionsByKey.delete(sessionKey);
        });

        sessionsByKey.set(sessionKey, session);
        console.log('[Terminal] Started warm terminal session');
        return session;
    })();

    sessionsStartingByKey.set(sessionKey, startup);
    try {
        return await startup;
    } finally {
        sessionsStartingByKey.delete(sessionKey);
    }
}

export async function warmTerminalSession(cookieHeader?: string, terminalSessionId?: string | null): Promise<boolean> {
    if (!isAuthenticatedCookieHeader(cookieHeader)) {
        return false;
    }

    const sessionKey = getSessionKey(cookieHeader, terminalSessionId);
    if (!sessionKey) {
        return false;
    }

    await ensureTerminalSession(sessionKey);
    return true;
}

export const initWebSocketServer = (server: Server) => {
    const wss = new WebSocketServer({ server, path: '/api/terminal' });
    const defaultShouldHandle = wss.shouldHandle.bind(wss);

    wss.shouldHandle = (req) => {
        const allowed = defaultShouldHandle(req) && isAuthenticatedCookieHeader(req.headers.cookie);
        if (!allowed) {
            console.warn('[Terminal] Rejected unauthenticated terminal upgrade');
        }
        return allowed;
    };

    console.log('[Terminal] WebSocket server initialized at /api/terminal');

    wss.on('connection', (ws, req) => {
        if (!isAuthenticatedCookieHeader(req.headers.cookie)) {
            console.warn('[Terminal] Rejected unauthenticated terminal connection');
            ws.close(1008, 'Unauthorized');
            return;
        }

        const requestUrl = new URL(req.url ?? '/api/terminal', 'http://localhost');
        const terminalSessionId = requestUrl.searchParams.get('sessionId');
        const sessionKey = getSessionKey(req.headers.cookie, terminalSessionId);
        if (!sessionKey) {
            ws.close(1008, 'Unauthorized');
            return;
        }

        void (async () => {
            const actor = await resolveTrustedRequestContext(new Request('http://localhost/api/terminal', {
                headers: req.headers.cookie ? { cookie: req.headers.cookie } : {},
            }), prisma).catch(() => null);
            if (!actor || !permissionAllows(actor.permissions, 'ops', 'run')) {
                ws.close(1008, 'Unauthorized');
                return;
            }

            let session: TerminalSession;
            try {
                session = await ensureTerminalSession(sessionKey);
            } catch (error) {
                console.error('[Terminal] Native terminal runtime unavailable:', error);
                ws.close(1011, 'Terminal runtime unavailable');
                return;
            }

            console.log('[Terminal] Client connected');
            session.sockets.add(ws);
            socketToSessionKey.set(ws, sessionKey);
            ws.send('\r\n[ScriptManager] Reusing warm terminal session\r\n');

            // Pipe websocket input to pty
            ws.on('message', (message) => {
                const msg = message.toString();
                if (msg === '\x01kill') {
                    destroySession(sessionKey);
                } else if (msg.startsWith('\x01resize:')) {
                    // Handle resize: \x01resize:cols,rows
                    const parts = msg.slice(8).split(',');
                    const cols = parseInt(parts[0]);
                    const rows = parseInt(parts[1]);
                    if (!isNaN(cols) && !isNaN(rows) && cols > 0 && rows > 0) {
                        session.process.resize(cols, rows);
                    }
                } else {
                    session.process.write(msg);
                }
            });

            ws.on('close', () => {
                console.log('[Terminal] Client disconnected');
                session.sockets.delete(ws);
                socketToSessionKey.delete(ws);
                scheduleSessionCleanup(sessionKey);
            });
        })();
    });
};
