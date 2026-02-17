import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { Server } from 'http';
import os from 'os';

interface TerminalSession {
    process: pty.IPty;
    socket: WebSocket;
}

const sessions = new Map<WebSocket, TerminalSession>();

export const initWebSocketServer = (server: Server) => {
    const wss = new WebSocketServer({ server, path: '/api/terminal' });

    console.log('[Terminal] WebSocket server initialized at /api/terminal');

    wss.on('connection', (ws) => {
        console.log('[Terminal] Client connected');

        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

        let ptyProcess: pty.IPty;
        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: process.cwd(),
                env: process.env as { [key: string]: string },
                // On Windows inside Electron there is no console window so ConPTY's
                // AttachConsole call fails. Fall back to the WinPTY backend instead.
                useConpty: false,
            });
        } catch (err) {
            console.error('[Terminal] pty.spawn failed, retrying without ConPTY:', err);
            try {
                ptyProcess = pty.spawn(shell, [], {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 24,
                    cwd: process.cwd(),
                    env: process.env as { [key: string]: string },
                    useConpty: false,
                });
            } catch (err2) {
                console.error('[Terminal] pty.spawn failed entirely:', err2);
                ws.send('\r\nFailed to start terminal: ' + String(err2) + '\r\n');
                ws.close();
                return;
            }
        }

        sessions.set(ws, { process: ptyProcess, socket: ws });

        // Pipe pty output to websocket
        ptyProcess.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Pipe websocket input to pty
        ws.on('message', (message) => {
            const msg = message.toString();
            if (msg.startsWith('\x01resize:')) {
                // Handle resize: \x01resize:cols,rows
                const parts = msg.slice(8).split(',');
                const cols = parseInt(parts[0]);
                const rows = parseInt(parts[1]);
                if (!isNaN(cols) && !isNaN(rows)) {
                    ptyProcess.resize(cols, rows);
                }
            } else {
                ptyProcess.write(msg);
            }
        });

        ws.on('close', () => {
            console.log('[Terminal] Client disconnected');
            ptyProcess.kill();
            sessions.delete(ws);
        });
    });
};
