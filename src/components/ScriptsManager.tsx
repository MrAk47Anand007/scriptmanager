'use client'

import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
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
} from '@/features/scripts/scriptsSlice';
import type { Script } from '@/features/scripts/scriptsSlice';
import { TagsInput } from './TagsInput';
import { EnvVarsPanel } from './EnvVarsPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Play, Save, Terminal, Clock, Link as LinkIcon, Calendar, RefreshCw, Folder, Github, Loader2, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScriptsSidebar } from './ScriptsSidebar';
import { ParametersPanel } from './ParametersPanel';
import { RunInputsDialog } from './RunInputsDialog';
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
    const { items: scripts, collections, activeScriptId, activeScriptContent, builds, currentBuildOutput, saveStatus, schedule, contentStatus, runStatus, allTags, envVars } = useAppSelector((state) => state.scripts);
    const { settings } = useAppSelector((state) => state.settings);
    const consoleRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [cronExpression, setCronExpression] = useState('');
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scriptLanguage, setScriptLanguage] = useState('python');
    const [customInterpreter, setCustomInterpreter] = useState('');

    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isTerminalMinimized, setIsTerminalMinimized] = useState(false);

    // Parameters state
    const [scriptParameters, setScriptParameters] = useState<ScriptParameter[]>([]);
    const [showRunDialog, setShowRunDialog] = useState(false);

    // Initial data fetching is centralized in page.tsx

    useEffect(() => {
        if (activeScriptId) {
            setShowRunDialog(false);

            dispatch(fetchScriptContent(activeScriptId));
            dispatch(fetchBuilds(activeScriptId));
            dispatch(fetchSchedule(activeScriptId));
            dispatch(fetchEnvVars(activeScriptId));

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

    const handleSave = async () => {
        if (activeScriptId) {
            const script = scripts.find(s => s.id === activeScriptId);
            if (script) {
                await dispatch(saveScript({
                    id: activeScriptId,
                    name: script.name,
                    content: activeScriptContent,
                    sync_to_gist: script.sync_to_gist,
                    language: scriptLanguage,
                    interpreter: scriptLanguage === 'custom' ? customInterpreter : null,
                    parameters: scriptParameters,
                }));
            }
        }
    };

    const toggleGistSync = async (enabled: boolean) => {
        if (enabled && !settings['github_token']) {
            alert("Please configure your GitHub Token in Settings first.");
            return;
        }

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
                    return;
                }
                dispatch(appendBuildOutput(event.data + '\n'));
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

    return (
        <div className="flex h-screen bg-white">
            {/* Sidebar List */}
            <ScriptsSidebar />

            {/* Main Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeScriptId ? (
                    <>
                        <div className="border-b px-4 py-2 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-4">
                                <span className="font-semibold text-sm text-slate-700">
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

                                <div className="flex items-center gap-1.5 mr-2" title="Sync to GitHub Gist">
                                    <Switch
                                        id="gist-sync-toggle"
                                        checked={activeScript?.sync_to_gist || false}
                                        onCheckedChange={toggleGistSync}
                                        className="h-4 w-7"
                                    />
                                    <Label htmlFor="gist-sync-toggle" className="text-[10px] text-slate-500 cursor-pointer">Gist</Label>
                                </div>

                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saveStatus === 'saving'}>
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
                                        theme="vs-dark"
                                        value={activeScriptContent || ''}
                                        onChange={(value) => dispatch(updateActiveScriptContent(value || ''))}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            padding: { top: 16, bottom: 16 },
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
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
                        <span>Select a script to start editing</span>
                        <span className="text-xs">or click <span className="font-semibold">+</span> in the sidebar to create one</span>
                    </div>
                )}
            </div>

            {/* Right Panel */}
            <div className="w-96 border-l flex flex-col bg-slate-50 overflow-y-auto">
                {activeScriptId && (
                    <div className="p-4 border-b bg-white space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                                    <LinkIcon className="h-3 w-3" /> Webhook
                                </h3>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleRegenerateWebhook} title="Regenerate Token">
                                    <RefreshCw className="h-3 w-3 text-slate-400" />
                                </Button>
                            </div>
                            <div className="bg-slate-100 p-2 rounded border border-slate-200 text-[10px] font-mono break-all text-slate-600 select-all">
                                {webhookUrl}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">POST to this URL to trigger the script</p>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> Schedule
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500">{scheduleEnabled ? 'On' : 'Off'}</span>
                                    <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} className="scale-75 origin-right" />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    className="h-7 text-xs font-mono"
                                    placeholder="Cron (e.g. */15 * * * *)"
                                    value={cronExpression}
                                    onChange={(e) => setCronExpression(e.target.value)}
                                />
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleScheduleSave}>Save</Button>
                            </div>
                            {schedule.nextRun && (
                                <div className="mt-1 text-[10px] text-slate-400">
                                    Next run: {new Date(schedule.nextRun).toLocaleString()}
                                </div>
                            )}
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
                    </div>
                )}

                <div className="h-1/3 flex flex-col border-b min-h-[150px]">
                    <div className="px-3 py-2 border-b bg-slate-100 text-xs font-semibold text-slate-500 uppercase flex items-center gap-2">
                        <Clock className="h-3 w-3" /> Build History
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {builds.length === 0 && <div className="p-4 text-xs text-slate-400 text-center italic">No builds yet</div>}
                        {builds.map((build, index) => (
                            <div
                                key={build.id}
                                className="px-3 py-2 border-b border-slate-100 hover:bg-white cursor-pointer transition-colors"
                                onClick={() => handleBuildClick(build.id)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-slate-700">#{builds.length - index}</span>
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                                        build.status === 'success' ? "bg-green-100 text-green-700" :
                                            build.status === 'failure' ? "bg-red-100 text-red-700" :
                                                "bg-yellow-100 text-yellow-700"
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
                <div className="flex-1 flex flex-col min-h-[200px]">
                    <div className="px-3 py-2 border-b bg-slate-950 text-xs font-semibold text-slate-400 uppercase flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal className="h-3 w-3" /> Console Output
                        </div>
                        {(!isTerminalOpen || isTerminalMinimized) && (
                            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-slate-500 hover:text-slate-300" onClick={() => { setIsTerminalOpen(true); setIsTerminalMinimized(false); }}>
                                {isTerminalMinimized ? 'Restore Terminal' : 'Open Terminal'}
                            </Button>
                        )}
                    </div>
                    <div
                        ref={consoleRef}
                        className="flex-1 overflow-y-auto bg-slate-950 text-slate-300 p-3 font-mono text-xs whitespace-pre-wrap"
                    >
                        {currentBuildOutput || <span className="text-slate-600 italic">Ready...</span>}
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
