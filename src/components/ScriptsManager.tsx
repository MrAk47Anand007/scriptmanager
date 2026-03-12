'use client'

import { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import dynamic from 'next/dynamic';

const TerminalComponent = dynamic(() => import('./TerminalComponent').then(mod => mod.TerminalComponent), {
    ssr: false,
    loading: () => <div className="h-64 bg-slate-950 flex items-center justify-center border-t border-slate-700"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
});
import {
    fetchScriptContent, saveScript, runScript, fetchBuilds, fetchBuildOutput,
    updateActiveScriptContent, appendBuildOutput, clearBuildOutput,
    regenerateWebhook, fetchSchedule, saveSchedule,
    moveScript, addTagToScript, removeTagFromScript, fetchAllTags,
    fetchEnvVars, upsertEnvVar, deleteEnvVar,
    fetchVersions,
    regenerateWebhookSecret, toggleWebhookSignature,
} from '@/features/scripts/scriptsSlice';
import type { Script } from '@/features/scripts/scriptsSlice';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { TagsInput } from './TagsInput';
import { EnvVarsPanel } from './EnvVarsPanel';
import { ServerProfilesPanel } from './ServerProfilesPanel';
import { RemoteExecutionPanel } from './RemoteExecutionPanel';
import { AuditTrailPanel } from './AuditTrailPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Save, Terminal, Clock, Link as LinkIcon, Calendar, RefreshCw, Folder, Github, Loader2, SlidersHorizontal, Download, ShieldCheck, KeyRound } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScriptsSidebar } from './ScriptsSidebar';
import { ParametersPanel } from './ParametersPanel';
import { RunInputsDialog } from './RunInputsDialog';

import { useTheme } from "next-themes";
import type { ScriptParameter } from '@/lib/types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const LANGUAGE_OPTIONS = [
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'JavaScript (Node)' },
    { value: 'shell', label: 'Shell/Bash' },
    { value: 'custom', label: 'Custom' },
]



export const ScriptsManager = () => {
    const dispatch = useAppDispatch();
    const { items: scripts, collections, activeScriptId, activeScriptContent, builds, currentBuildOutput, saveStatus, schedule, contentStatus, runStatus, allTags, envVars, autoSaveEnabled } = useAppSelector((state) => state.scripts);
    const { settings } = useAppSelector((state) => state.settings);
    const isModeActive = useAppSelector((state) => state.ops.isModeActive);
    const { resolvedTheme } = useTheme();
    const consoleRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [cronExpression, setCronExpression] = useState('');
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scriptLanguage, setScriptLanguage] = useState('python');
    const [customInterpreter, setCustomInterpreter] = useState('');
    const [isGistSyncing, setIsGistSyncing] = useState(false);
    const [gistDirty, setGistDirty] = useState(false);

    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isTerminalMinimized, setIsTerminalMinimized] = useState(false);

    // Parameters state
    const [scriptParameters, setScriptParameters] = useState<ScriptParameter[]>([]);
    const [showRunDialog, setShowRunDialog] = useState(false);

    // Timeout state (empty string = use global default)
    const [timeoutSecs, setTimeoutSecs] = useState<string>('');

    // Webhook HMAC state
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
    const [isWebhookLoading, setIsWebhookLoading] = useState(false);

    // Initial data fetching is centralized in page.tsx

    useEffect(() => {
        if (activeScriptId) {
            setShowRunDialog(false);
            setRevealedSecret(null);

            dispatch(fetchScriptContent(activeScriptId));
            dispatch(fetchBuilds(activeScriptId));
            dispatch(fetchSchedule(activeScriptId));
            dispatch(fetchEnvVars(activeScriptId));
            dispatch(fetchVersions(activeScriptId));

            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            dispatch(clearBuildOutput());

            // Load language + parameter settings from script
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                setScriptLanguage(script.language || 'python');
                setCustomInterpreter(script.interpreter || '');
                setScriptParameters(script.parameters || []);
                setTimeoutSecs(script.timeout_ms ? String(script.timeout_ms / 1000) : '');
            }
        }
    }, [activeScriptId, dispatch]);

    // Also update language + params when scripts list updates (after fetch)
    useEffect(() => {
        if (activeScriptId) {
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                setScriptLanguage(script.language || 'python');
                setCustomInterpreter(script.interpreter || '');
                setScriptParameters(script.parameters || []);
                setTimeoutSecs(script.timeout_ms ? String(script.timeout_ms / 1000) : '');
            }
        }
    }, [scripts, activeScriptId]);

    useEffect(() => {
        setCronExpression(schedule.cron);
        setScheduleEnabled(schedule.enabled);
    }, [schedule]);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [currentBuildOutput]);

    const handleSave = async (options: { skipGist?: boolean, isAutoSave?: boolean } = {}) => {
        if (activeScriptId) {
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                const timeoutMs = timeoutSecs.trim() ? Math.round(parseFloat(timeoutSecs) * 1000) : null;
                const result = await dispatch(saveScript({
                    id: activeScriptId,
                    name: script.name,
                    content: activeScriptContent,
                    sync_to_gist: script.sync_to_gist,
                    language: scriptLanguage,
                    interpreter: scriptLanguage === 'custom' ? customInterpreter : null,
                    parameters: scriptParameters,
                    timeout_ms: timeoutMs,
                    skipGist: options.skipGist
                }));

                if (saveScript.fulfilled.match(result)) {
                    // Refresh version list after manual save only (autosaves don't create new version entries)
                    if (!options.isAutoSave) {
                        dispatch(fetchVersions(activeScriptId));
                    }
                    if (!options.skipGist) {
                        setGistDirty(false);
                    }
                }
            }
        }
    };

    // Auto-save effect (Local DB only)
    useEffect(() => {
        if (!autoSaveEnabled || !activeScriptId || saveStatus === 'saving') return;

        // Check if dirty
        const script = scripts.find(s => s.id === activeScriptId);
        if (!script) return;

        const savedContent = script.content || '';
        if (savedContent === activeScriptContent) return; // Not dirty

        const timer = setTimeout(() => {
            // Save locally, skip Gist
            handleSave({ skipGist: true, isAutoSave: true });
            // Mark Gist as dirty if Gist sync is enabled
            if (script.sync_to_gist) {
                setGistDirty(true);
            }
        }, 2000); // 2 seconds debounce

        return () => clearTimeout(timer);
    }, [activeScriptContent, autoSaveEnabled, activeScriptId, scripts, saveStatus, scriptLanguage, customInterpreter, scriptParameters, timeoutSecs]);

    // Gist Sync Interval Effect (Every 10 mins)
    useEffect(() => {
        const timer = setInterval(() => {
            if (activeScriptId && gistDirty) {
                const script = scripts.find(s => s.id === activeScriptId);
                if (script && script.sync_to_gist) {
                    console.log('[Gist] Auto-syncing to Gist...');
                    handleSave({ skipGist: false });
                }
            }
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(timer);
    }, [activeScriptId, gistDirty, scripts]);

    // Sync Gist on unmount or script change
    useEffect(() => {
        return () => {
            if (activeScriptId && gistDirty) {
                const script = scripts.find(s => s.id === activeScriptId);
                if (script && script.sync_to_gist) {
                    console.log('[Gist] Syncing on close/change...');
                    handleSave({ skipGist: false });
                }
            }
        };
    }, [activeScriptId, gistDirty /* scripts omitted to avoid stale closure issues, but might need ref ref pattern if strict */]);

    const toggleGistSync = async (enabled: boolean) => {
        if (enabled && !settings['github_token']) {
            alert("Please configure your GitHub Token in Settings first.");
            return;
        }

        try {
            setIsGistSyncing(true);
            if (activeScriptId) {
                const script = scripts.find(s => s.id === activeScriptId);
                if (script) {
                    await dispatch(saveScript({
                        id: activeScriptId,
                        name: script.name,
                        content: activeScriptContent,
                        sync_to_gist: enabled,
                        language: scriptLanguage,
                        interpreter: scriptLanguage === 'custom' ? customInterpreter : null
                    }));
                }
            }
        } finally {
            setIsGistSyncing(false);
        }
    }

    const handleScheduleSave = async () => {
        if (activeScriptId) {
            await dispatch(saveSchedule({ scriptId: activeScriptId, cron: cronExpression, enabled: scheduleEnabled }));
        }
    }

    const handleRegenerateWebhook = async () => {
        if (activeScriptId && confirm("Regenerate webhook URL? The old one will stop working.")) {
            await dispatch(regenerateWebhook(activeScriptId));
        }
    }

    const executeRun = async (paramValues: Record<string, string>) => {
        if (!activeScriptId) return;

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        dispatch(clearBuildOutput());
        const resultAction = await dispatch(runScript({ id: activeScriptId, paramValues }));

        if (runScript.fulfilled.match(resultAction)) {
            const buildId = resultAction.payload.build_id;

            const es = new EventSource(`/api/builds/${buildId}/stream`);
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                if (event.data === '[DONE]') {
                    es.close();
                    eventSourceRef.current = null;
                    dispatch(fetchBuilds(activeScriptId));
                    // Fetch full output to ensure we didn't miss anything (race condition for fast scripts)
                    dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId }));
                    return;
                }
                const cleanData = event.data.replace(/^data: /, '').trim();
                // SSE sends "data: " prefix sometimes if manual parsing not handled by EventSource class (browser handles it, but our raw string check might be loose)
                // Actually EventSource.onmessage event.data is the payload.
                // Our server sends: `data: ${line}\n\n`
                // Browser EventSource parses this and event.data = line.
                // So event.data is the line content.
                // But we should check if line is just newline?

                // Server sends: controller.enqueue(encoder.encode(`data: ${line}\n\n`))
                // If line has newlines, SSE spec says they are joined by newline.
                // We just append it.
                dispatch(appendBuildOutput(event.data));
            };

            es.onerror = () => {
                es.close();
                eventSourceRef.current = null;
                dispatch(appendBuildOutput('\n[Connection closed]'));
                dispatch(fetchBuilds(activeScriptId));
            };
        }
    };

    const handleRun = async () => {
        if (!activeScriptId) return;
        // If the script has parameters, show the fill-in dialog first
        if (scriptParameters.length > 0) {
            setShowRunDialog(true);
            return;
        }
        // No parameters — run immediately
        await executeRun({});
    };

    const handleBuildClick = async (buildId: string) => {
        if (!activeScriptId) return;
        await dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId }));
    };

    const handleMoveScript = async (collectionId: string) => {
        if (activeScriptId) {
            await dispatch(moveScript({
                scriptId: activeScriptId,
                collectionId: collectionId === 'unsorted' ? null : collectionId
            }));
        }
    }

    const activeScript = scripts.find(s => s.id === activeScriptId);
    const webhookUrl = activeScript?.webhook_token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${activeScript.webhook_token}`
        : 'No webhook generated yet';

    // Monaco Editor IntelliSense Customization
    const handleEditorDidMount = useCallback((editor: any, monaco: Monaco) => {
        // Python Completion Provider
        monaco.languages.registerCompletionItemProvider('python', {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions = [
                    {
                        label: 'def',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'def ${1:function_name}(${2:args}):\n\t${3:pass}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Function definition',
                        range,
                    },
                    {
                        label: 'if',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'if ${1:condition}:\n\t${2:pass}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'If statement',
                        range,
                    },
                    {
                        label: 'for',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'For loop',
                        range,
                    },
                    {
                        label: 'try',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${4:print(e)}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Try/Except block',
                        range,
                    },
                    {
                        label: 'print',
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: 'print(${1:object})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Print to console',
                        range,
                    },
                    {
                        label: 'import',
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: 'import ',
                        documentation: 'Import module',
                        range,
                    },
                    {
                        label: 'from',
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: 'from ${1:module} import ${2:submodule}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'From import',
                        range,
                    },
                ];
                return { suggestions };
            },
        });

        // JavaScript Completion Provider
        monaco.languages.registerCompletionItemProvider('javascript', {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };

                const suggestions = [
                    {
                        label: 'console.log',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'console.log(${1:item});',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Log to console',
                        range,
                    },
                    {
                        label: 'function',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'function ${1:name}(${2:args}) {\n\t${3}\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Function declaration',
                        range,
                    },
                    {
                        label: 'const',
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: 'const ${1:name} = ${2:value};',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'Constant declaration',
                        range,
                    },
                    {
                        label: 'if',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'if (${1:condition}) {\n\t${2}\n}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        documentation: 'If statement',
                        range,
                    },
                ];
                return { suggestions };
            },
        });
    }, []);

    return (
        <div className="flex h-screen bg-white dark:bg-slate-950 overflow-hidden">
            {/* ── Left Sidebar ── */}
            <div className="w-[250px] flex-shrink-0 border-r dark:border-slate-800">
                <ScriptsSidebar />
            </div>

            {/* ── Main Editor Area ── */}
            <div className="flex-1 min-w-0 flex flex-col relative h-full">
                {activeScriptId ? (
                    <div className="h-full flex flex-col">
                        <div className="border-b px-4 py-2 flex items-center justify-between bg-white dark:bg-slate-950 dark:border-slate-800">
                            <div className="flex items-center gap-4">
                                <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
                                    {scripts.find(s => s.id === activeScriptId)?.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Folder className="h-3.5 w-3.5 text-slate-400" />
                                    <Select
                                        value={activeScript?.collection_id || 'unsorted'}
                                        onValueChange={handleMoveScript}
                                    >
                                        <SelectTrigger className="h-6 w-[140px] text-xs border-slate-200">
                                            <SelectValue placeholder="Collection" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="unsorted">Unsorted</SelectItem>
                                            {collections.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {/* Language selector */}
                                <div className="flex items-center gap-1.5">
                                    <Select value={scriptLanguage} onValueChange={setScriptLanguage}>
                                        <SelectTrigger className="h-6 w-[140px] text-xs border-slate-200">
                                            <SelectValue placeholder="Language" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {LANGUAGE_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {scriptLanguage === 'custom' && (
                                        <Input
                                            className="h-6 w-32 text-xs"
                                            placeholder="interpreter path"
                                            value={customInterpreter}
                                            onChange={(e) => setCustomInterpreter(e.target.value)}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 items-center">
                                {activeScript?.gist_url && (
                                    <a href={activeScript.gist_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline mr-2" title="View on GitHub Gist">
                                        <Github className="h-3.5 w-3.5" />
                                    </a>
                                )}

                                <div className="flex flex-col items-center gap-1 mr-4" title="Sync to GitHub Gist">
                                    {isGistSyncing ? (
                                        <div className="h-4 flex items-center">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                                        </div>
                                    ) : (
                                        <Switch
                                            id="gist-sync-toggle"
                                            checked={activeScript?.sync_to_gist || false}
                                            onCheckedChange={toggleGistSync}
                                            className="h-4 w-7"
                                        />
                                    )}
                                    <Label htmlFor="gist-sync-toggle" className="text-[9px] text-slate-500 cursor-pointer">
                                        {isGistSyncing ? 'Syncing' : 'Gist'}
                                    </Label>
                                </div>



                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1"
                                    title="Export script as JSON"
                                    onClick={() => {
                                        if (activeScriptId) {
                                            window.open(`/api/scripts/${activeScriptId}/export`, '_blank')
                                        }
                                    }}
                                >
                                    <Download className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleSave({ skipGist: false })} disabled={saveStatus === 'saving'}>
                                    <Save className="h-3 w-3" />
                                    {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleRun} disabled={runStatus === 'running'}>
                                    {runStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                    {runStatus === 'running' ? 'Running...' : 'Run'}
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col relative overflow-hidden"> {/* New flex-col wrapper with overflow handling */}
                            <div className="flex-1 relative min-h-0"> {/* min-h-0 is critical for flex shrinking */}
                                {contentStatus === 'loading' ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                    </div>
                                ) : (
                                    <Editor
                                        height="100%"
                                        defaultLanguage="python"
                                        language={
                                            scriptLanguage === 'node' ? 'javascript' :
                                                scriptLanguage === 'shell' ? 'shell' :
                                                    scriptLanguage === 'python' ? 'python' : 'plaintext'
                                        }
                                        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
                                        value={activeScriptContent || ''}
                                        onChange={(value) => dispatch(updateActiveScriptContent(value || ''))}
                                        onMount={handleEditorDidMount}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            padding: { top: 16, bottom: 16 },
                                            suggest: {
                                                showWords: true,
                                                showSnippets: true,
                                            },
                                            quickSuggestions: {
                                                other: true,
                                                comments: true,
                                                strings: true,
                                            },
                                        }}
                                    />
                                )}
                            </div>
                            {isTerminalOpen && (
                                <TerminalComponent
                                    isMinimized={isTerminalMinimized}
                                    toggleMinimize={() => setIsTerminalMinimized(!isTerminalMinimized)}
                                    onClose={() => setIsTerminalOpen(false)}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                        <span>Select a script to start editing</span>
                        <span className="text-xs">or click <span className="font-semibold">+</span> in the sidebar to create one</span>
                    </div>
                )}
            </div>

            {/* ── Right Panel ── */}
            <div className="w-[350px] flex-shrink-0 border-l dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {isModeActive && <ServerProfilesPanel />}
                    {isModeActive && <RemoteExecutionPanel />}
                    {isModeActive && <AuditTrailPanel />}
                    <div className="flex-none flex flex-col h-[250px] min-h-[200px] border-b">
                        <div className="px-3 py-2 border-b bg-amber-50 dark:bg-slate-950 text-xs font-semibold text-amber-900/80 dark:text-slate-400 uppercase flex items-center gap-2 overflow-hidden">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Terminal className="h-3 w-3 shrink-0" />
                                <span className="truncate">Console Output</span>
                            </div>
                            {(!isTerminalOpen || isTerminalMinimized) && (
                                <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-800/60 dark:text-slate-500 hover:text-amber-900 dark:hover:text-slate-300 shrink-0 whitespace-nowrap px-1.5" onClick={() => { setIsTerminalOpen(true); setIsTerminalMinimized(false); }}>
                                    {isTerminalMinimized ? 'Restore' : 'Terminal'}
                                </Button>
                            )}
                        </div>
                        <div
                            ref={consoleRef}
                            className="flex-1 overflow-y-auto bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300 p-3 font-mono text-xs whitespace-pre-wrap"
                        >
                            {currentBuildOutput || <span className="text-slate-600 italic">Ready...</span>}
                        </div>
                    </div>
                    {activeScriptId && (
                        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4">
                            <div>
                                <div className="flex items-center gap-2 mb-2 overflow-hidden">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 flex-1 min-w-0">
                                        <LinkIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Webhook</span>
                                    </h3>
                                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleRegenerateWebhook} title="Regenerate Token">
                                        <RefreshCw className="h-3 w-3 text-slate-400" />
                                    </Button>
                                </div>
                                <div className="bg-slate-100 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-mono break-all text-slate-600 dark:text-slate-400 select-all">
                                    {webhookUrl}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">POST to this URL to trigger the script</p>

                                {/* HMAC Signature Verification */}
                                <div className="mt-2 border-t pt-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1 flex-1 min-w-0">
                                            <ShieldCheck className="h-3 w-3 shrink-0" />
                                            <span className="truncate">Require Signature</span>
                                        </span>
                                        {isWebhookLoading ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-slate-500 shrink-0" />
                                        ) : (
                                            <Switch
                                                checked={activeScript?.require_webhook_signature ?? false}
                                                onCheckedChange={async (checked) => {
                                                    if (!activeScriptId) return
                                                    setIsWebhookLoading(true)
                                                    try {
                                                        const result = await dispatch(toggleWebhookSignature({ scriptId: activeScriptId, requireSignature: checked }))
                                                        if (toggleWebhookSignature.fulfilled.match(result) && result.payload.webhook_secret) {
                                                            setRevealedSecret(result.payload.webhook_secret)
                                                        }
                                                    } finally {
                                                        setIsWebhookLoading(false)
                                                    }
                                                }}
                                                className="scale-75 origin-right"
                                            />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                            <KeyRound className="h-3 w-3" />
                                            {activeScript?.webhook_secret_set ? 'Secret configured' : 'No secret set'}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-4 text-[9px] text-blue-500 hover:text-blue-700 px-1"
                                            onClick={async () => {
                                                if (!activeScriptId) return
                                                const result = await dispatch(regenerateWebhookSecret(activeScriptId))
                                                if (regenerateWebhookSecret.fulfilled.match(result)) {
                                                    setRevealedSecret(result.payload.secret)
                                                }
                                            }}
                                        >
                                            {activeScript?.webhook_secret_set ? 'Rotate' : 'Generate'}
                                        </Button>
                                    </div>
                                    {revealedSecret && (
                                        <div className="mt-1.5">
                                            <p className="text-[9px] text-amber-600 dark:text-amber-500 mb-1">⚠ Copy now — shown once only</p>
                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-1.5 rounded text-[9px] font-mono break-all text-amber-800 dark:text-amber-200 select-all">
                                                {revealedSecret}
                                            </div>
                                            <p className="text-[9px] text-slate-400 mt-1">
                                                Header: <code>X-Hub-Signature-256: sha256=&#123;HMAC_SHA256(secret, body)&#125;</code>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-2 overflow-hidden">
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 flex-1 min-w-0">
                                        <Calendar className="h-3 w-3 shrink-0" /> <span className="truncate">Schedule</span>
                                    </h3>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{scheduleEnabled ? 'On' : 'Off'}</span>
                                        <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} className="scale-75 origin-right" />
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <Input
                                        className="h-7 text-xs font-mono bg-white dark:bg-slate-950 dark:border-slate-700 flex-1 min-w-0"
                                        placeholder="Cron (e.g. */15 * * * *)"
                                        value={cronExpression}
                                        onChange={(e) => setCronExpression(e.target.value)}
                                    />
                                    <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" onClick={handleScheduleSave}>Save</Button>
                                </div>
                                {schedule.nextRun && (
                                    <div className="mt-1 text-[10px] text-slate-400">
                                        Next run: {new Date(schedule.nextRun).toLocaleString()}
                                    </div>
                                )}
                            </div>

                            {/* Timeout section */}
                            <div>
                                <div className="flex items-center gap-1 mb-1.5">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Timeout</h3>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Input
                                        className="h-7 text-xs w-20 bg-white dark:bg-slate-950 dark:border-slate-700 flex-shrink-0"
                                        type="number"
                                        min="1"
                                        placeholder="30"
                                        value={timeoutSecs}
                                        onChange={(e) => setTimeoutSecs(e.target.value)}
                                        title="Execution timeout in seconds (empty = global default)"
                                    />
                                    <span className="text-[10px] text-slate-400">sec (empty = default)</span>
                                </div>
                            </div>

                            {/* Parameters section */}
                            <div>
                                <ParametersPanel
                                    parameters={scriptParameters}
                                    onChange={setScriptParameters}
                                />
                            </div>

                            {/* Tags section */}
                            {activeScriptId && (() => {
                                const activeScript = scripts.find(s => s.id === activeScriptId)
                                return (
                                    <div>
                                        <TagsInput
                                            scriptId={activeScriptId}
                                            tags={activeScript?.tags ?? []}
                                            allTags={allTags}
                                            onAdd={(name) => dispatch(addTagToScript({ scriptId: activeScriptId, name }))}
                                            onRemove={(tagId) => dispatch(removeTagFromScript({ scriptId: activeScriptId, tagId }))}
                                        />
                                    </div>
                                )
                            })()}

                            {/* Env Vars section */}
                            {activeScriptId && (
                                <div>
                                    <EnvVarsPanel
                                        envVars={envVars}
                                        onAdd={(key, value, isSecret) => dispatch(upsertEnvVar({ scriptId: activeScriptId, key, value, isSecret }))}
                                        onDelete={(key) => dispatch(deleteEnvVar({ scriptId: activeScriptId, key }))}
                                    />
                                </div>
                            )}

                            {/* Version History section */}
                            {activeScriptId && (
                                <div>
                                    <VersionHistoryPanel
                                        scriptId={activeScriptId}
                                        currentContent={activeScriptContent}
                                        language={scriptLanguage}
                                        onRestore={(content) => {
                                            dispatch(updateActiveScriptContent(content));
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="h-1/3 flex flex-col border-b dark:border-slate-800 min-h-[150px]">
                        <div className="px-3 py-2 border-b dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 overflow-hidden">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="truncate flex-1 min-w-0">Build History</span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {builds.length === 0 && <div className="p-4 text-xs text-slate-400 text-center italic">No builds yet</div>}
                            {builds.map((build, index) => (
                                <div
                                    key={build.id}
                                    className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                    onClick={() => handleBuildClick(build.id)}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">#{builds.length - index}</span>
                                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                                            build.status === 'success' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                                build.status === 'failure' ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                                                    build.status === 'timeout' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400" :
                                                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                        )}>{build.status}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>{new Date(build.started_at).toLocaleTimeString()}</span>
                                        <span>{build.triggered_by}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Run Inputs Dialog — shown when script has parameters */}
            <RunInputsDialog
                key={activeScriptId ?? 'none'}
                open={showRunDialog}
                parameters={scriptParameters}
                onRun={(values) => {
                    setShowRunDialog(false);
                    executeRun(values);
                }}
                onCancel={() => setShowRunDialog(false)}
            />
        </div>
    );
};
