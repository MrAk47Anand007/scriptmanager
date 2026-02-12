'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Loader2, Minimize2, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TerminalComponentProps {
    onClose: () => void;
    isMinimized: boolean;
    toggleMinimize: () => void;
}

export const TerminalComponent = ({ onClose, isMinimized, toggleMinimize }: TerminalComponentProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!terminalRef.current || isMinimized) return;

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: '#0f172a', // slate-900
                foreground: '#e2e8f0', // slate-200
            },
            rows: 24,
            cols: 80
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        // Initial fit
        requestAnimationFrame(() => fitAddon.fit());

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Connect to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/terminal`;
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            setIsConnected(true);
            term.write('\r\n\x1b[32m✔ Connected to terminal session\x1b[0m\r\n\r\n');
            // Send initial resize
            const { cols, rows } = term;
            socket.send(`\x01resize:${cols},${rows}`);
        };

        socket.onmessage = (event) => {
            if (typeof event.data === 'string') {
                term.write(event.data);
            }
        };

        socket.onclose = () => {
            setIsConnected(false);
            term.write('\r\n\x1b[31m✖ Connection closed\x1b[0m\r\n');
        };

        socket.onerror = (err) => {
            console.error('WebSocket error:', err);
            term.write('\r\n\x1b[31m✖ Connection error\x1b[0m\r\n');
        };

        // Handle terminal input -> send to socket
        term.onData((data) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(data);
            }
        });

        // Handle resize
        const handleResize = () => {
            if (!fitAddonRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
            fitAddonRef.current.fit();
            const { cols, rows } = term;
            socketRef.current.send(`\x01resize:${cols},${rows}`);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            socket.close();
            term.dispose();
            xtermRef.current = null;
        };
    }, [isMinimized]); // Re-initialize when un-minimized (simple approach, or keep instance alive and just hide)

    // Fit addon needs a re-fit when view changes (e.g. minimize toggle)
    useEffect(() => {
        if (!isMinimized && fitAddonRef.current) {
            requestAnimationFrame(() => fitAddonRef.current?.fit());
        }
    }, [isMinimized]);


    if (isMinimized) {
        return (
            <div className="h-8 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-800" onClick={toggleMinimize}>
                <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    Terminal
                </span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}>
                        <Maximize2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-400" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-64 bg-slate-950 border-t border-slate-700">
            <div className="h-8 bg-slate-900 flex items-center justify-between px-4 border-b border-slate-700 select-none">
                <span className="text-xs font-mono text-slate-300 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    Terminal
                </span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400" onClick={toggleMinimize}>
                        <Minimize2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-400" onClick={onClose}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden p-1 relative">
                <div ref={terminalRef} className="h-full w-full" />
                {!isConnected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10 pointers-events-none">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                    </div>
                )}
            </div>
        </div>
    );
};
