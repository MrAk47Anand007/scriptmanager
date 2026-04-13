'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import {
    Loader2,
    Maximize2,
    Minimize2,
    Plus,
    SquareTerminal,
    Trash2,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    closeDesktopTerminal,
    copyDesktopClipboardText,
    DEFAULT_TERMINAL_SESSION_ID,
    hasDesktopScriptsRuntime,
    readDesktopClipboardText,
    resizeDesktopTerminal,
    sendDesktopTerminalInput,
    subscribeToDesktopTerminal,
    warmScriptsTerminal,
} from '@/lib/scriptsRuntimeClient';

type TerminalSessionStatus = 'connecting' | 'connected' | 'closed' | 'error';

type PendingTerminalCommand =
    | {
        sessionId?: string;
        command: string;
    }
    | null
    | undefined;

type TerminalSessionTab = {
    id: string;
    title: string;
    status: TerminalSessionStatus;
    lastError?: string | null;
};

interface TerminalComponentProps {
    onClose: () => void;
    isMinimized: boolean;
    isVisible: boolean;
    toggleMinimize: () => void;
    pendingCommand?: PendingTerminalCommand;
    onCommandSent?: (sessionId: string) => void;
    onActiveSessionChange?: (sessionId: string) => void;
    className?: string;
}

const TERMINAL_SESSION_PREFIX = 'terminal-';

function getTerminalTheme(resolvedTheme: string | undefined) {
    return resolvedTheme === 'dark'
        ? {
            background: '#020617',
            foreground: '#e2e8f0',
            cursor: '#e2e8f0',
            selectionBackground: '#334155',
        }
        : {
            background: '#fffbeb',
            foreground: '#334155',
            cursor: '#334155',
            selectionBackground: '#e2e8f0',
        };
}

function buildSession(sequence: number): TerminalSessionTab {
    return {
        id: sequence === 1 ? DEFAULT_TERMINAL_SESSION_ID : `${TERMINAL_SESSION_PREFIX}${sequence}`,
        title: `Terminal ${sequence}`,
        status: 'connecting',
        lastError: null,
    };
}

export const TerminalComponent = ({
    onClose,
    isMinimized,
    isVisible,
    toggleMinimize,
    pendingCommand,
    onCommandSent,
    onActiveSessionChange,
    className,
}: TerminalComponentProps) => {
    const [sessions, setSessions] = useState<TerminalSessionTab[]>(() => [buildSession(1)]);
    const [activeSessionId, setActiveSessionId] = useState<string>(DEFAULT_TERMINAL_SESSION_ID);
    const { resolvedTheme } = useTheme();
    const isDesktopRuntime = typeof window !== 'undefined' && hasDesktopScriptsRuntime();
    const nextSessionNumberRef = useRef(1);
    const sessionsRef = useRef(sessions);
    const activeSessionIdRef = useRef(activeSessionId);
    const isVisibleRef = useRef(isVisible);
    const terminalsRef = useRef(new Map<string, Terminal>());
    const fitAddonsRef = useRef(new Map<string, FitAddon>());
    const socketRefs = useRef(new Map<string, WebSocket>());
    const resizeObserversRef = useRef(new Map<string, ResizeObserver>());
    const reconnectTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const containerRefs = useRef(new Map<string, HTMLDivElement | null>());
    const pendingDataRef = useRef(new Map<string, string[]>());
    const pendingCommandsRef = useRef(new Map<string, string[]>());
    const connectedBannerRef = useRef(new Set<string>());
    const closingSessionsRef = useRef(new Set<string>());
    const sessionTheme = useMemo(() => getTerminalTheme(resolvedTheme), [resolvedTheme]);

    useEffect(() => {
        sessionsRef.current = sessions;
    }, [sessions]);

    useEffect(() => {
        activeSessionIdRef.current = activeSessionId;
        onActiveSessionChange?.(activeSessionId);
    }, [activeSessionId, onActiveSessionChange]);

    useEffect(() => {
        isVisibleRef.current = isVisible;
    }, [isVisible]);

    const updateSession = useCallback((sessionId: string, updater: (session: TerminalSessionTab) => TerminalSessionTab) => {
        setSessions((current) => current.map((session) => (session.id === sessionId ? updater(session) : session)));
    }, []);

    const writeToTerminal = useCallback((sessionId: string, data: string) => {
        const terminal = terminalsRef.current.get(sessionId);
        if (terminal) {
            terminal.write(data);
            return;
        }

        const pending = pendingDataRef.current.get(sessionId) ?? [];
        pending.push(data);
        pendingDataRef.current.set(sessionId, pending);
    }, []);

    const fitSession = useCallback((sessionId: string) => {
        const terminal = terminalsRef.current.get(sessionId);
        const fitAddon = fitAddonsRef.current.get(sessionId);
        if (!terminal || !fitAddon) {
            return;
        }

        fitAddon.fit();

        if (terminal.cols <= 0 || terminal.rows <= 0) {
            return;
        }

        if (isDesktopRuntime) {
            resizeDesktopTerminal(terminal.cols, terminal.rows, sessionId).catch(() => undefined);
            return;
        }

        const socket = socketRefs.current.get(sessionId);
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(`\x01resize:${terminal.cols},${terminal.rows}`);
        }
    }, [isDesktopRuntime]);

    const flushPendingOutput = useCallback((sessionId: string) => {
        const terminal = terminalsRef.current.get(sessionId);
        const pending = pendingDataRef.current.get(sessionId);
        if (!terminal || !pending?.length) {
            return;
        }

        for (const chunk of pending) {
            terminal.write(chunk);
        }

        pendingDataRef.current.delete(sessionId);
    }, []);

    const flushPendingCommands = useCallback((sessionId: string) => {
        const commands = pendingCommandsRef.current.get(sessionId);
        if (!commands?.length) {
            return;
        }

        pendingCommandsRef.current.delete(sessionId);

        if (isDesktopRuntime) {
            Promise.all(commands.map((command) => sendDesktopTerminalInput(`${command}\r`, sessionId).catch(() => undefined)))
                .then(() => onCommandSent?.(sessionId))
                .catch(() => undefined);
            return;
        }

        const socket = socketRefs.current.get(sessionId);
        if (socket?.readyState !== WebSocket.OPEN) {
            pendingCommandsRef.current.set(sessionId, commands);
            return;
        }

        for (const command of commands) {
            socket.send(`${command}\r`);
        }

        onCommandSent?.(sessionId);
    }, [isDesktopRuntime, onCommandSent]);

    const copySelection = useCallback(async (sessionId: string) => {
        const terminal = terminalsRef.current.get(sessionId);
        const selection = terminal?.getSelection();
        if (!selection) {
            return;
        }

        await copyDesktopClipboardText(selection);
    }, []);

    const pasteIntoSession = useCallback(async (sessionId: string) => {
        const text = await readDesktopClipboardText();
        if (!text) {
            return;
        }

        if (isDesktopRuntime) {
            await sendDesktopTerminalInput(text, sessionId);
            return;
        }

        const socket = socketRefs.current.get(sessionId);
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(text);
        }
    }, [isDesktopRuntime]);

    const clearSession = useCallback((sessionId: string) => {
        terminalsRef.current.get(sessionId)?.clear();
    }, []);

    const selectAllInSession = useCallback((sessionId: string) => {
        terminalsRef.current.get(sessionId)?.selectAll();
    }, []);

    const ensureBrowserConnection = useCallback((sessionId: string) => {
        const existingSocket = socketRefs.current.get(sessionId);
        if (existingSocket && (existingSocket.readyState === WebSocket.OPEN || existingSocket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/terminal?sessionId=${encodeURIComponent(sessionId)}`;
        const socket = new WebSocket(wsUrl);
        socketRefs.current.set(sessionId, socket);

        socket.onopen = () => {
            updateSession(sessionId, (session) => ({ ...session, status: 'connected', lastError: null }));
            if (!connectedBannerRef.current.has(sessionId)) {
                writeToTerminal(sessionId, '\r\n\x1b[32m[ScriptManager] Connected to terminal session\x1b[0m\r\n\r\n');
                connectedBannerRef.current.add(sessionId);
            }
            fitSession(sessionId);
            flushPendingCommands(sessionId);
        };

        socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
                writeToTerminal(sessionId, event.data);
            }
        };

        socket.onerror = () => {
            updateSession(sessionId, (session) => ({ ...session, status: 'error', lastError: 'Connection error' }));
        };

        socket.onclose = () => {
            socketRefs.current.delete(sessionId);
            connectedBannerRef.current.delete(sessionId);

            if (closingSessionsRef.current.has(sessionId)) {
                return;
            }

            updateSession(sessionId, (session) => ({ ...session, status: 'closed', lastError: 'Connection closed' }));

            if (!isVisibleRef.current) {
                return;
            }

            const reconnectTimer = setTimeout(() => {
                reconnectTimersRef.current.delete(sessionId);
                if (sessionsRef.current.some((session) => session.id === sessionId) && !closingSessionsRef.current.has(sessionId)) {
                    updateSession(sessionId, (session) => ({ ...session, status: 'connecting', lastError: null }));
                    warmScriptsTerminal(sessionId)
                        .then(() => ensureBrowserConnection(sessionId))
                        .catch(() => {
                            updateSession(sessionId, (session) => ({ ...session, status: 'error', lastError: 'Unable to reconnect' }));
                        });
                }
            }, 600);

            reconnectTimersRef.current.set(sessionId, reconnectTimer);
        };
    }, [fitSession, flushPendingCommands, updateSession, writeToTerminal]);

    const ensureTerminalSession = useCallback((sessionId: string) => {
        const container = containerRefs.current.get(sessionId);
        if (!container || terminalsRef.current.has(sessionId)) {
            return;
        }

        const terminal = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: sessionTheme,
            rows: 24,
            cols: 80,
            allowTransparency: true,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(container);

        terminal.attachCustomKeyEventHandler((event) => {
            const key = event.key.toLowerCase();
            const hasModifier = event.ctrlKey || event.metaKey;

            if (!hasModifier || event.type !== 'keydown') {
                return true;
            }

            if (key === 'v') {
                event.preventDefault();
                void pasteIntoSession(sessionId);
                return false;
            }

            if (key === 'c' && (terminal.hasSelection() || event.shiftKey)) {
                event.preventDefault();
                void copySelection(sessionId);
                return false;
            }

            return true;
        });

        terminal.onData((data) => {
            if (isDesktopRuntime) {
                sendDesktopTerminalInput(data, sessionId).catch(() => undefined);
                return;
            }

            const socket = socketRefs.current.get(sessionId);
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(data);
            }
        });

        terminalsRef.current.set(sessionId, terminal);
        fitAddonsRef.current.set(sessionId, fitAddon);

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => fitSession(sessionId));
        });
        resizeObserver.observe(container);
        resizeObserversRef.current.set(sessionId, resizeObserver);

        requestAnimationFrame(() => {
            fitSession(sessionId);
            flushPendingOutput(sessionId);
        });

        if (isDesktopRuntime) {
            warmScriptsTerminal(sessionId)
                .then(() => {
                    // The main process sends a 'connected' IPC event before resolving, but
                    // in rare cases the event can be missed. If the session is still
                    // 'connecting' after the IPC call resolves, force it to 'connected'.
                    updateSession(sessionId, (session) =>
                        session.status === 'connecting' ? { ...session, status: 'connected', lastError: null } : session,
                    );
                    if (!connectedBannerRef.current.has(sessionId)) {
                        writeToTerminal(sessionId, '\r\n\x1b[32m[ScriptManager] Connected to terminal session\x1b[0m\r\n\r\n');
                        connectedBannerRef.current.add(sessionId);
                    }
                    requestAnimationFrame(() => fitSession(sessionId));
                })
                .catch((error) => {
                    updateSession(sessionId, (session) => ({
                        ...session,
                        status: 'error',
                        lastError: error instanceof Error ? error.message : 'Terminal start failed',
                    }));
                    writeToTerminal(
                        sessionId,
                        `\r\n\x1b[31m[ScriptManager] ${error instanceof Error ? error.message : 'Terminal start failed'}\x1b[0m\r\n`,
                    );
                });
            return;
        }

        warmScriptsTerminal(sessionId)
            .then(() => ensureBrowserConnection(sessionId))
            .catch((error) => {
                updateSession(sessionId, (session) => ({
                    ...session,
                    status: 'error',
                    lastError: error instanceof Error ? error.message : 'Terminal start failed',
                }));
            });
    }, [
        copySelection,
        ensureBrowserConnection,
        fitSession,
        flushPendingOutput,
        isDesktopRuntime,
        pasteIntoSession,
        sessionTheme,
        updateSession,
        writeToTerminal,
    ]);

    const disposeTerminalSession = useCallback((sessionId: string, closeBackend: boolean) => {
        const reconnectTimer = reconnectTimersRef.current.get(sessionId);
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimersRef.current.delete(sessionId);
        }

        const resizeObserver = resizeObserversRef.current.get(sessionId);
        resizeObserver?.disconnect();
        resizeObserversRef.current.delete(sessionId);

        const socket = socketRefs.current.get(sessionId);
        if (socket) {
            if (!isDesktopRuntime && closeBackend && socket.readyState === WebSocket.OPEN) {
                socket.send('\x01kill');
            }
            socket.close();
            socketRefs.current.delete(sessionId);
        }

        if (isDesktopRuntime && closeBackend) {
            closeDesktopTerminal(sessionId).catch(() => undefined);
        }

        terminalsRef.current.get(sessionId)?.dispose();
        terminalsRef.current.delete(sessionId);
        fitAddonsRef.current.delete(sessionId);
        pendingDataRef.current.delete(sessionId);
        pendingCommandsRef.current.delete(sessionId);
        connectedBannerRef.current.delete(sessionId);
    }, [isDesktopRuntime]);

    const createSession = useCallback(() => {
        nextSessionNumberRef.current += 1;
        const session = buildSession(nextSessionNumberRef.current);
        setSessions((current) => [...current, session]);
        setActiveSessionId(session.id);
        requestAnimationFrame(() => ensureTerminalSession(session.id));
        return session.id;
    }, [ensureTerminalSession]);

    const queueCommand = useCallback((sessionId: string, command: string) => {
        const targetSessionId = sessionId || activeSessionIdRef.current || DEFAULT_TERMINAL_SESSION_ID;
        const pending = pendingCommandsRef.current.get(targetSessionId) ?? [];
        pending.push(command);
        pendingCommandsRef.current.set(targetSessionId, pending);

        if (!sessionsRef.current.some((session) => session.id === targetSessionId)) {
            setSessions((current) => [...current, {
                id: targetSessionId,
                title: targetSessionId === DEFAULT_TERMINAL_SESSION_ID ? 'Terminal 1' : targetSessionId,
                status: 'connecting',
                lastError: null,
            }]);
            requestAnimationFrame(() => ensureTerminalSession(targetSessionId));
        }

        if (isDesktopRuntime) {
            flushPendingCommands(targetSessionId);
            return;
        }

        const socket = socketRefs.current.get(targetSessionId);
        if (socket?.readyState === WebSocket.OPEN) {
            flushPendingCommands(targetSessionId);
        }
    }, [ensureTerminalSession, flushPendingCommands, isDesktopRuntime]);

    const ensureAtLeastOneSession = useCallback((remaining: TerminalSessionTab[]) => {
        if (remaining.length > 0) {
            return remaining;
        }

        nextSessionNumberRef.current += 1;
        const freshSession = buildSession(nextSessionNumberRef.current);
        requestAnimationFrame(() => ensureTerminalSession(freshSession.id));
        setActiveSessionId(freshSession.id);
        return [freshSession];
    }, [ensureTerminalSession]);

    const killSession = useCallback((sessionId: string) => {
        closingSessionsRef.current.add(sessionId);
        disposeTerminalSession(sessionId, true);

        setSessions((current) => {
            const remaining = ensureAtLeastOneSession(current.filter((session) => session.id !== sessionId));
            setActiveSessionId(remaining[0]?.id ?? DEFAULT_TERMINAL_SESSION_ID);
            return remaining;
        });

        setTimeout(() => {
            closingSessionsRef.current.delete(sessionId);
        }, 400);
    }, [disposeTerminalSession, ensureAtLeastOneSession]);

    const killOtherSessions = useCallback((keepSessionId: string) => {
        const others = sessionsRef.current.filter((session) => session.id !== keepSessionId);
        for (const session of others) {
            closingSessionsRef.current.add(session.id);
            disposeTerminalSession(session.id, true);
        }

        setSessions((current) => current.filter((session) => session.id === keepSessionId));
        setActiveSessionId(keepSessionId);

        setTimeout(() => {
            for (const session of others) {
                closingSessionsRef.current.delete(session.id);
            }
        }, 400);
    }, [disposeTerminalSession]);

    const killAllSessions = useCallback(() => {
        const currentSessions = sessionsRef.current;
        for (const session of currentSessions) {
            closingSessionsRef.current.add(session.id);
            disposeTerminalSession(session.id, true);
        }

        nextSessionNumberRef.current += 1;
        const freshSession = buildSession(nextSessionNumberRef.current);
        setSessions([freshSession]);
        setActiveSessionId(freshSession.id);
        requestAnimationFrame(() => ensureTerminalSession(freshSession.id));

        setTimeout(() => {
            for (const session of currentSessions) {
                closingSessionsRef.current.delete(session.id);
            }
        }, 400);
    }, [disposeTerminalSession, ensureTerminalSession]);

    useEffect(() => {
        const handleWindowResize = () => {
            if (!activeSessionIdRef.current || isMinimized || !isVisibleRef.current) {
                return;
            }

            fitSession(activeSessionIdRef.current);
        };

        window.addEventListener('resize', handleWindowResize);
        return () => window.removeEventListener('resize', handleWindowResize);
    }, [fitSession, isMinimized]);

    useEffect(() => {
        if (!isDesktopRuntime) {
            return;
        }

        return subscribeToDesktopTerminal((event) => {
            if (!sessionsRef.current.some((session) => session.id === event.sessionId) && event.sessionId !== DEFAULT_TERMINAL_SESSION_ID) {
                return;
            }

            if (event.type === 'connected') {
                updateSession(event.sessionId, (session) => ({ ...session, status: 'connected', lastError: null }));
                if (!connectedBannerRef.current.has(event.sessionId)) {
                    writeToTerminal(event.sessionId, '\r\n\x1b[32m[ScriptManager] Connected to terminal session\x1b[0m\r\n\r\n');
                    connectedBannerRef.current.add(event.sessionId);
                }
                requestAnimationFrame(() => fitSession(event.sessionId));
                flushPendingCommands(event.sessionId);
                return;
            }

            if (event.type === 'data') {
                writeToTerminal(event.sessionId, event.data);
                return;
            }

            if (closingSessionsRef.current.has(event.sessionId)) {
                return;
            }

            if (event.type === 'error') {
                updateSession(event.sessionId, (session) => ({ ...session, status: 'error', lastError: event.message }));
                writeToTerminal(event.sessionId, `\r\n\x1b[31m[ScriptManager] ${event.message}\x1b[0m\r\n`);
                connectedBannerRef.current.delete(event.sessionId);
                return;
            }

            updateSession(event.sessionId, (session) => ({ ...session, status: 'closed', lastError: 'Terminal closed' }));
            connectedBannerRef.current.delete(event.sessionId);
            writeToTerminal(event.sessionId, '\r\n\x1b[31m[ScriptManager] Terminal closed\x1b[0m\r\n');
        });
    }, [fitSession, flushPendingCommands, isDesktopRuntime, updateSession, writeToTerminal]);

    useEffect(() => {
        for (const session of sessions) {
            ensureTerminalSession(session.id);
        }
    }, [ensureTerminalSession, sessions]);

    useEffect(() => {
        for (const terminal of terminalsRef.current.values()) {
            terminal.options.theme = sessionTheme;
        }
    }, [sessionTheme]);

    useEffect(() => {
        if (!activeSessionId || !isVisible || isMinimized) {
            return;
        }

        requestAnimationFrame(() => {
            fitSession(activeSessionId);
            terminalsRef.current.get(activeSessionId)?.focus();
        });
    }, [activeSessionId, fitSession, isMinimized, isVisible]);

    useEffect(() => {
        if (!pendingCommand?.command) {
            return;
        }

        queueCommand(pendingCommand.sessionId ?? activeSessionIdRef.current ?? DEFAULT_TERMINAL_SESSION_ID, pendingCommand.command);
    }, [pendingCommand, queueCommand]);

    useEffect(() => {
        return () => {
            for (const session of sessionsRef.current) {
                disposeTerminalSession(session.id, false);
            }
        };
    }, [disposeTerminalSession]);

    const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];

    const statusDotClass = (status: TerminalSessionStatus) => {
        if (status === 'connected') return 'bg-green-500';
        if (status === 'error') return 'bg-red-500';
        if (status === 'closed') return 'bg-amber-500';
        return 'bg-blue-500 animate-pulse';
    };

    const terminalBody = (
        <div className={`flex h-full min-h-0 flex-col border-t ${resolvedTheme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-amber-50 border-amber-200'} ${className ?? ''}`}>
            <div className={`flex h-9 items-center gap-2 border-b px-2 select-none ${resolvedTheme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-amber-100/60 border-amber-200'}`}>
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <div className={`flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-mono ${resolvedTheme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-amber-50 text-slate-700'}`}>
                        <SquareTerminal className="h-3.5 w-3.5" />
                        <span>Terminal</span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-px">
                        {sessions.map((session) => (
                            <button
                                key={session.id}
                                type="button"
                                onClick={() => setActiveSessionId(session.id)}
                                onContextMenu={() => setActiveSessionId(session.id)}
                                className={`group flex h-7 items-center gap-2 rounded-md border px-2 text-[11px] font-mono transition-colors ${activeSessionId === session.id
                                    ? resolvedTheme === 'dark'
                                        ? 'border-slate-600 bg-slate-800 text-slate-100'
                                        : 'border-amber-300 bg-white text-slate-900'
                                    : resolvedTheme === 'dark'
                                        ? 'border-transparent bg-slate-900/60 text-slate-400 hover:bg-slate-800'
                                        : 'border-transparent bg-amber-50/60 text-slate-600 hover:bg-white'
                                    }`}
                            >
                                <span className={`h-2 w-2 rounded-full ${statusDotClass(session.status)}`} />
                                <span className="max-w-[120px] truncate">{session.title}</span>
                                <span
                                    className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        killSession(session.id);
                                    }}
                                >
                                    <X className="h-3 w-3" />
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={() => createSession()}
                        title="New terminal"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={() => activeSession && killSession(activeSession.id)}
                        title="Kill active terminal"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={toggleMinimize}
                        title="Minimize terminal panel"
                    >
                        <Minimize2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 hover:text-red-400 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={onClose}
                        title="Hide terminal panel"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <div className="relative flex-1 overflow-hidden p-1">
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        className={`absolute inset-1 ${activeSessionId === session.id ? 'block' : 'hidden'}`}
                    >
                        <div
                            ref={(node) => {
                                containerRefs.current.set(session.id, node);
                            }}
                            className="h-full w-full"
                        />
                    </div>
                ))}
                {activeSession && activeSession.status === 'connecting' && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                    </div>
                )}
            </div>
        </div>
    );

    if (!isVisible) {
        return <div className={`hidden ${className ?? ''}`}>{terminalBody}</div>;
    }

    if (isMinimized) {
        return (
            <div
                className={`flex h-8 items-center justify-between border-t px-4 cursor-pointer ${resolvedTheme === 'dark' ? 'bg-slate-900 border-slate-700 hover:bg-slate-800' : 'bg-amber-100/70 border-amber-200 hover:bg-amber-100'} ${className ?? ''}`}
                onClick={toggleMinimize}
            >
                <span className={`flex items-center gap-2 text-xs font-mono ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span className={`h-2 w-2 rounded-full ${activeSession ? statusDotClass(activeSession.status) : 'bg-slate-400'}`} />
                    {activeSession?.title ?? 'Terminal'}
                </span>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleMinimize();
                        }}
                    >
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 hover:text-red-400 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onClose();
                        }}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                {terminalBody}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => createSession()}>
                    New Terminal
                    <ContextMenuShortcut>Ctrl+Shift+`</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => activeSession && void copySelection(activeSession.id)}>
                    Copy
                    <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => activeSession && void pasteIntoSession(activeSession.id)}>
                    Paste
                    <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => activeSession && selectAllInSession(activeSession.id)}>
                    Select All
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => activeSession && clearSession(activeSession.id)}>
                    Clear
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => activeSession && killSession(activeSession.id)}>
                    Kill Terminal
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => activeSession && killOtherSessions(activeSession.id)}>
                    Kill Others
                </ContextMenuItem>
                <ContextMenuItem onSelect={killAllSessions}>
                    Kill All
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};
