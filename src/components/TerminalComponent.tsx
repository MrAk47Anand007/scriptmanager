'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Loader2, Minimize2, Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import {
    closeDesktopTerminal,
    hasDesktopScriptsRuntime,
    resizeDesktopTerminal,
    sendDesktopTerminalInput,
    subscribeToDesktopTerminal,
    warmScriptsTerminal,
} from '@/lib/scriptsRuntimeClient';

interface TerminalComponentProps {
    onClose: () => void;
    isMinimized: boolean;
    isVisible: boolean;
    toggleMinimize: () => void;
    pendingCommand?: string | null;
    onCommandSent?: () => void;
    className?: string;
}

export const TerminalComponent = ({ onClose, isMinimized, isVisible, toggleMinimize, pendingCommand, onCommandSent, className }: TerminalComponentProps) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const lastSentCommandRef = useRef<string | null>(null);
    const hasShownConnectedBannerRef = useRef(false);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isVisibleRef = useRef(isVisible);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionKey, setConnectionKey] = useState(0);
    const { resolvedTheme } = useTheme();
    const isDesktopRuntime = typeof window !== 'undefined' && hasDesktopScriptsRuntime();

    useEffect(() => {
        isVisibleRef.current = isVisible;
    }, [isVisible]);

    useEffect(() => {
        if (!terminalRef.current) return;

        let isDisposed = false;

        // Initialize xterm.js
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: resolvedTheme === 'dark'
                ? {
                    background: '#020617', // slate-950
                    foreground: '#e2e8f0', // slate-200
                    cursor: '#e2e8f0',
                    selectionBackground: '#334155', // slate-700
                }
                : {
                    background: '#fffbeb', // amber-50 (cream)
                    foreground: '#334155', // slate-700
                    cursor: '#334155',
                    selectionBackground: '#e2e8f0', // slate-200
                },
            rows: 24,
            cols: 80
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);

        // Initial fit
        requestAnimationFrame(() => {
            if (!isDisposed) {
                fitAddon.fit();
            }
        });

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        const handleResize = () => {
            if (isDisposed || !fitAddonRef.current) return;
            fitAddonRef.current.fit();
            const { cols, rows } = term;
            if (cols <= 0 || rows <= 0) {
                return;
            }

            if (isDesktopRuntime) {
                resizeDesktopTerminal(cols, rows).catch(() => undefined);
                return;
            }

            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(`\x01resize:${cols},${rows}`);
            }
        };

        window.addEventListener('resize', handleResize);

        let disposeDesktopSubscription: (() => void) | null = null;
        let socket: WebSocket | null = null;

        if (isDesktopRuntime) {
            disposeDesktopSubscription = subscribeToDesktopTerminal((event) => {
                if (isDisposed) {
                    return;
                }

                if (event.type === 'connected') {
                    setIsConnected((current) => current || true);
                    if (!hasShownConnectedBannerRef.current) {
                        term.write('\r\n\x1b[32m✔ Connected to terminal session\x1b[0m\r\n\r\n');
                        hasShownConnectedBannerRef.current = true;
                    }
                    requestAnimationFrame(() => handleResize());
                    return;
                }

                if (event.type === 'data') {
                    term.write(event.data);
                    return;
                }

                if (event.type === 'error') {
                    setIsConnected(false);
                    hasShownConnectedBannerRef.current = false;
                    term.write(`\r\n\x1b[31m✖ ${event.message}\x1b[0m\r\n`);
                    return;
                }

                if (event.type === 'closed') {
                    setIsConnected(false);
                    hasShownConnectedBannerRef.current = false;
                    term.write('\r\n\x1b[31m✖ Connection closed\x1b[0m\r\n');
                }
            });

            warmScriptsTerminal().catch((error) => {
                if (isDisposed) {
                    return;
                }
                setIsConnected(false);
                term.write(`\r\n\x1b[31m✖ ${error instanceof Error ? error.message : 'Terminal start failed'}\x1b[0m\r\n`);
            }).then(() => {
                if (isDisposed) {
                    return;
                }
                setIsConnected(true);
                requestAnimationFrame(() => handleResize());
            });
        } else {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/terminal`;
            socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                if (isDisposed) {
                    socket?.close();
                    return;
                }
                setIsConnected(true);
                if (!hasShownConnectedBannerRef.current) {
                    term.write('\r\n\x1b[32m✔ Connected to terminal session\x1b[0m\r\n\r\n');
                    hasShownConnectedBannerRef.current = true;
                }
                handleResize();
            };

            socket.onmessage = (event) => {
                if (!isDisposed && typeof event.data === 'string') {
                    term.write(event.data);
                }
            };

            socket.onclose = () => {
                if (isDisposed) {
                    return;
                }
                setIsConnected(false);
                hasShownConnectedBannerRef.current = false;
                term.write('\r\n\x1b[31m✖ Connection closed\x1b[0m\r\n');
                socketRef.current = null;
                if (isVisibleRef.current && !reconnectTimerRef.current) {
                    reconnectTimerRef.current = setTimeout(() => {
                        reconnectTimerRef.current = null;
                        setConnectionKey((current) => current + 1);
                    }, 500);
                }
            };

            socket.onerror = (err) => {
                if (isDisposed) {
                    return;
                }
                console.error('WebSocket error:', err);
                hasShownConnectedBannerRef.current = false;
                term.write('\r\n\x1b[31m✖ Connection error\x1b[0m\r\n');
            };
        }

        term.onData((data) => {
            if (isDesktopRuntime) {
                sendDesktopTerminalInput(data).catch(() => undefined);
                return;
            }

            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(data);
            }
        });

        // Observe container size changes (e.g. resizable panel drag)
        let resizeObserver: ResizeObserver | null = null;
        let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
        if (terminalRef.current) {
            resizeObserver = new ResizeObserver(() => {
                if (resizeDebounce) clearTimeout(resizeDebounce);
                resizeDebounce = setTimeout(() => {
                    requestAnimationFrame(() => {
                        if (!isDisposed) {
                            handleResize();
                        }
                    });
                }, 150);
            });
            resizeObserver.observe(terminalRef.current);
        }

        return () => {
            isDisposed = true;
            window.removeEventListener('resize', handleResize);
            resizeObserver?.disconnect();
            if (resizeDebounce) clearTimeout(resizeDebounce);
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            disposeDesktopSubscription?.();
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
                socket.close();
            }
            term.dispose();
            xtermRef.current = null;
            fitAddonRef.current = null;
            socketRef.current = null;
            setIsConnected(false);
            hasShownConnectedBannerRef.current = false;
        };
    }, [connectionKey, isDesktopRuntime, resolvedTheme]);

    useEffect(() => {
        if (!isVisible || socketRef.current) {
            return;
        }

        lastSentCommandRef.current = null;
        setConnectionKey((current) => current + 1);
    }, [isVisible]);

    useEffect(() => {
        if (!xtermRef.current) return;

        xtermRef.current.options.theme = resolvedTheme === 'dark'
            ? {
                background: '#020617', // slate-950
                foreground: '#e2e8f0', // slate-200
                cursor: '#e2e8f0',
                selectionBackground: '#334155', // slate-700
            }
            : {
                background: '#fffbeb', // amber-50 (cream)
                foreground: '#334155', // slate-700
                cursor: '#334155',
                selectionBackground: '#e2e8f0', // slate-200
            };
    }, [resolvedTheme]);

    // Fit addon needs a re-fit when view changes (e.g. minimize toggle)
    useEffect(() => {
        if (isVisible && !isMinimized && fitAddonRef.current && xtermRef.current) {
            requestAnimationFrame(() => fitAddonRef.current?.fit());
        }
    }, [isMinimized, isVisible]);

    useEffect(() => {
        if (!pendingCommand || !isConnected || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            return;
        }

        if (lastSentCommandRef.current === pendingCommand) {
            return;
        }

        socketRef.current.send(`${pendingCommand}\r`);
        lastSentCommandRef.current = pendingCommand;
        onCommandSent?.();
    }, [pendingCommand, isConnected, onCommandSent]);


    if (!isVisible) {
        return (
            <div className={`hidden ${className ?? ''}`}>
                <div ref={terminalRef} className="h-full w-full" />
            </div>
        );
    }

    if (isMinimized) {
        return (
            <div className={`h-8 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 cursor-pointer hover:bg-slate-800 ${className ?? ''}`} onClick={toggleMinimize}>
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
        <div className={`flex h-full min-h-0 flex-col border-t ${resolvedTheme === 'dark' ? 'bg-slate-950 border-slate-700' : 'bg-amber-50 border-amber-200'} ${className ?? ''}`}>
            <div className={`h-8 flex items-center justify-between px-4 border-b select-none ${resolvedTheme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-amber-100/50 border-amber-200'}`}>
                <span className={`text-xs font-mono flex items-center gap-2 ${resolvedTheme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    Terminal
                </span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className={`h-6 w-6 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`} onClick={toggleMinimize}>
                        <Minimize2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className={`h-6 w-6 hover:text-red-400 ${resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`} onClick={onClose}>
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden p-1 relative">
                <div ref={terminalRef} className="h-full w-full" />
                {!isConnected && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 z-10 pointer-events-none">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                    </div>
                )}
            </div>
        </div>
    );
};
