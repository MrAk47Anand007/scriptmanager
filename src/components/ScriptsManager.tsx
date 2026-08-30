'use client'

import { memo, useEffect, useRef, useState, useCallback, useDeferredValue, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Monaco } from '@monaco-editor/react';
import { v4 as uuidv4 } from 'uuid';
import { EditorSkeleton } from '@/components/ui/EditorSkeleton';

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), {
    ssr: false,
    loading: () => <EditorSkeleton />,
});
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { shallowEqual } from 'react-redux';
import {
    selectScriptItems, selectCollections, selectActiveScriptId, selectActiveScriptContent,
    selectBuilds, selectSaveStatus, selectSchedule, selectContentStatus, selectRunStatus,
    selectAllTags, selectEnvVars, selectAutoSaveEnabled, selectActiveScript, selectVersionsStatus,
} from '@/features/scripts/selectors';
import dynamic from 'next/dynamic';

const TerminalComponent = dynamic(() => import('./TerminalComponent').then(mod => mod.TerminalComponent), {
    ssr: false,
    loading: () => <div className="h-64 bg-slate-950 flex items-center justify-center border-t border-slate-700"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
});
import { DOCK_PANE_IDS } from '@/components/workbench/BottomDock';
import { setActiveDockTab } from '@/features/workbench/workbenchSlice';
import {
    fetchScriptContent, fetchScripts, fetchCollections, saveScript, runScript, fetchBuilds, fetchBuildOutput,
    clearBuildOutput,
    regenerateWebhook, fetchSchedule, saveSchedule,
    moveScript, addTagToScript, removeTagFromScript, fetchAllTags,
    fetchEnvVars, upsertEnvVar, deleteEnvVar,
    fetchVersions,
    regenerateWebhookSecret, toggleWebhookSignature,
    setRunStatus,
} from '@/features/scripts/scriptsSlice';
import type { Script } from '@/features/scripts/scriptsSlice';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { BuildHistorySection } from './BuildHistorySection';
import { TagsInput } from './TagsInput';
import { EnvVarsPanel } from './EnvVarsPanel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
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
import {
    buildBrowserTerminalCommand,
    cancelDesktopRun,
    DEFAULT_TERMINAL_SESSION_ID,
    hasDesktopScriptsRuntime,
    listCanonicalRecoveryDrafts,
    runScriptInDesktopTerminal,
    discardCanonicalRecoveryDraft,
    saveCanonicalRecoveryDraft,
    setDesktopTerminalContext,
    startBrowserRun,
    startDesktopLocalRun,
    subscribeToCanonicalFolderChanges,
    subscribeToDesktopBuildEvents,
    exportScriptRuntime,
} from '@/lib/scriptsRuntimeClient';
import { readGithubGistSettingsRuntime } from '@/lib/gistCredentialsRuntimeClient';
import { getCanonicalFolderChangeEffect } from '@/lib/canonicalFolderReload';
import type { CanonicalRecoveryDraft } from '@/lib/scriptsRuntimeClient';
import { DESKTOP_BUILD_HISTORY_POLL_INTERVAL_MS, shouldPollDesktopBuildHistory } from '@/lib/buildHistoryPolling';
import { getOperationError } from '@/lib/operationError';

const LANGUAGE_OPTIONS = [
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'JavaScript (Node)' },
    { value: 'shell', label: 'Shell/Bash' },
    { value: 'custom', label: 'Custom' },
]

const ConsoleOutputSection = memo(function ConsoleOutputSection({
    consoleRef,
    buildOutput,
    runStatus,
    terminalLaunchStage,
    isLoadingBuildOutput,
    isTerminalOpen,
    isTerminalMinimized,
    onOpenTerminal,
}: {
    consoleRef: React.RefObject<HTMLDivElement | null>
    buildOutput: string
    runStatus: string
    terminalLaunchStage: 'saving' | 'preparing' | 'opening' | null
    isLoadingBuildOutput: boolean
    isTerminalOpen: boolean
    isTerminalMinimized: boolean
    onOpenTerminal: () => void
}) {
    return (
        <div className="flex h-full flex-col">
            <div className="px-3 py-2 border-b bg-amber-50 dark:bg-slate-950 text-xs font-semibold text-amber-900/80 dark:text-slate-400 uppercase flex items-center gap-2 overflow-hidden">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Terminal className="h-3 w-3 shrink-0" />
                    <span className="truncate">Console Output</span>
                </div>
                {(!isTerminalOpen || isTerminalMinimized) && (
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] text-amber-800/60 dark:text-slate-500 hover:text-amber-900 dark:hover:text-slate-300 shrink-0 whitespace-nowrap px-1.5" onClick={onOpenTerminal}>
                        {isTerminalMinimized ? 'Restore' : 'Terminal'}
                    </Button>
                )}
            </div>
            <div
                ref={consoleRef}
                className="flex-1 overflow-y-auto bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-300 p-3 font-mono text-xs whitespace-pre-wrap"
            >
                {buildOutput ? (
                    buildOutput
                ) : runStatus === 'running' ? (
                    <span className="text-slate-600 italic">Starting run and waiting for output...</span>
                ) : terminalLaunchStage ? (
                    <span className="text-slate-600 italic">
                        {terminalLaunchStage === 'saving' && 'Saving script before terminal launch...'}
                        {terminalLaunchStage === 'preparing' && 'Preparing terminal command...'}
                        {terminalLaunchStage === 'opening' && 'Opening terminal session...'}
                    </span>
                ) : isLoadingBuildOutput ? (
                    <span className="text-slate-600 italic">Loading build output...</span>
                ) : (
                    <span className="text-slate-600 italic">Ready...</span>
                )}
            </div>
        </div>
    )
})

const ScriptInspectorSection = memo(function ScriptInspectorSection({
    activeScript,
    activeScriptId,
    allTags,
    cronExpression,
    envVars,
    handleRegenerateWebhook,
    handleScheduleSave,
    handleToggleWebhookSignature,
    handleRotateWebhookSecret,
    handleAddTag,
    handleRemoveTag,
    handleAddEnvVar,
    handleDeleteEnvVar,
    isRegeneratingWebhook,
    isScheduleSaving,
    isWebhookLoading,
    revealedSecret,
    scheduleEnabled,
    scriptParameters,
    setCronExpression,
    setScheduleEnabled,
    setScriptParameters,
    timeoutSecs,
    setTimeoutSecs,
    webhookUrl,
    desktopRuntime,
}: {
    activeScript: Script | null | undefined
    activeScriptId: string
    allTags: ReturnType<typeof selectAllTags>
    cronExpression: string
    envVars: ReturnType<typeof selectEnvVars>
    handleRegenerateWebhook: () => void
    handleScheduleSave: () => void
    handleToggleWebhookSignature: (checked: boolean) => Promise<void>
    handleRotateWebhookSecret: () => Promise<void>
    handleAddTag: (name: string) => void
    handleRemoveTag: (tagId: string) => void
    handleAddEnvVar: (key: string, value: string, isSecret: boolean) => void
    handleDeleteEnvVar: (key: string) => void
    isRegeneratingWebhook: boolean
    isScheduleSaving: boolean
    isWebhookLoading: boolean
    revealedSecret: string | null
    scheduleEnabled: boolean
    scriptParameters: ScriptParameter[]
    setCronExpression: React.Dispatch<React.SetStateAction<string>>
    setScheduleEnabled: React.Dispatch<React.SetStateAction<boolean>>
    setScriptParameters: React.Dispatch<React.SetStateAction<ScriptParameter[]>>
    timeoutSecs: string
    setTimeoutSecs: React.Dispatch<React.SetStateAction<string>>
    webhookUrl: string
    desktopRuntime: boolean
}) {
    return (
        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-950 space-y-4">
            <div>
                <div className="flex items-center gap-2 mb-2 overflow-hidden">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 flex-1 min-w-0">
                        <LinkIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Webhook</span>
                    </h3>
                    <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={handleRegenerateWebhook} title="Regenerate Token" disabled={desktopRuntime || isRegeneratingWebhook}>
                        {isRegeneratingWebhook ? <Loader2 className="h-3 w-3 animate-spin text-slate-400" /> : <RefreshCw className="h-3 w-3 text-slate-400" />}
                    </Button>
                </div>
                <div className="bg-slate-100 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-mono break-all text-slate-600 dark:text-slate-400 select-all">
                    {webhookUrl}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{desktopRuntime ? 'Inbound webhooks require hosted web mode.' : 'POST to this URL to trigger the script'}</p>

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
                                onCheckedChange={handleToggleWebhookSignature}
                                disabled={desktopRuntime}
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
                            onClick={handleRotateWebhookSecret}
                            disabled={desktopRuntime}
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
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0 gap-1" onClick={handleScheduleSave} disabled={isScheduleSaving}>
                        {isScheduleSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                        {isScheduleSaving ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            </div>

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

            <div>
                <ParametersPanel
                    parameters={scriptParameters}
                    onChange={setScriptParameters}
                />
            </div>

            <div>
                <TagsInput
                    scriptId={activeScriptId}
                    tags={activeScript?.tags ?? []}
                    allTags={allTags}
                    onAdd={handleAddTag}
                    onRemove={handleRemoveTag}
                />
            </div>

            <div>
                <EnvVarsPanel
                    envVars={envVars}
                    onAdd={handleAddEnvVar}
                    onDelete={handleDeleteEnvVar}
                />
            </div>
        </div>
    )
})

const VersionHistorySection = memo(function VersionHistorySection({
    activeScriptId,
    currentContent,
    language,
    onRestore,
}: {
    activeScriptId: string
    currentContent: string
    language: string
    onRestore: (content: string) => void
}) {
    return (
        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-950">
            <VersionHistoryPanel
                scriptId={activeScriptId}
                currentContent={currentContent}
                language={language}
                onRestore={onRestore}
            />
        </div>
    )
})



interface ScriptsManagerProps {
    /** When hosted in the workbench shell, the sidebar lives in the shared SidePanel. */
    hideSidebar?: boolean;
}

export const ScriptsManager = ({ hideSidebar = false }: ScriptsManagerProps = {}) => {
    const dispatch = useAppDispatch();
    const scripts = useAppSelector(selectScriptItems, shallowEqual);
    const collections = useAppSelector(selectCollections, shallowEqual);
    const activeScriptId = useAppSelector(selectActiveScriptId);
    const activeScriptContent = useAppSelector(selectActiveScriptContent);
    const builds = useAppSelector(selectBuilds, shallowEqual);
    const saveStatus = useAppSelector(selectSaveStatus);
    const schedule = useAppSelector(selectSchedule, shallowEqual);
    const contentStatus = useAppSelector(selectContentStatus);
    const runStatus = useAppSelector(selectRunStatus);
    const allTags = useAppSelector(selectAllTags, shallowEqual);
    const envVars = useAppSelector(selectEnvVars, shallowEqual);
    const autoSaveEnabled = useAppSelector(selectAutoSaveEnabled);
    const activeScript = useAppSelector(selectActiveScript);
    const versionsStatus = useAppSelector(selectVersionsStatus);
    const { resolvedTheme } = useTheme();
    const isDesktopRuntime = useMemo(() => typeof window !== 'undefined' && hasDesktopScriptsRuntime(), []);
    const consoleRef = useRef<HTMLDivElement>(null);
    const buildSocketRef = useRef<WebSocket | null>(null);
    const pendingBuildSubscriptionRef = useRef<string | null>(null);
    const activeBuildSubscriptionRef = useRef<string | null>(null);
    const buildOutputBufferRef = useRef('');
    const buildOutputFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [shouldConnectBuildSocket, setShouldConnectBuildSocket] = useState(false);
    const [cronExpression, setCronExpression] = useState('');
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scriptLanguage, setScriptLanguage] = useState('python');
    const [customInterpreter, setCustomInterpreter] = useState('');
    const [isGistSyncing, setIsGistSyncing] = useState(false);
    const [gistDirty, setGistDirty] = useState(false);

    const [isTerminalOpen, setIsTerminalOpen] = useState(false);
    const [isTerminalMinimized, setIsTerminalMinimized] = useState(false);
    const [pendingTerminalCommand, setPendingTerminalCommand] = useState<{ sessionId: string; command: string } | null>(null);
    // Dock pane portal targets (rendered by BottomDock in the workbench shell)
    const [dockPaneEls, setDockPaneEls] = useState<{ terminal: HTMLElement; output: HTMLElement; builds: HTMLElement } | null>(null);
    const [activeTerminalSessionId, setActiveTerminalSessionId] = useState(DEFAULT_TERMINAL_SESSION_ID);
    const [scriptContent, setScriptContent] = useState('');
    const [buildOutput, setBuildOutput] = useState('');
    const [canonicalFolderNotice, setCanonicalFolderNotice] = useState<string | null>(null);
    const [recoveryDrafts, setRecoveryDrafts] = useState<CanonicalRecoveryDraft[]>([]);

    // Parameters state
    const [scriptParameters, setScriptParameters] = useState<ScriptParameter[]>([]);
    const [showRunDialog, setShowRunDialog] = useState(false);
    const [runTarget, setRunTarget] = useState<'background' | 'terminal'>('background');
    const deferredScriptContent = useDeferredValue(scriptContent);

    // Timeout state (empty string = use global default)
    const [timeoutSecs, setTimeoutSecs] = useState<string>('');

    // Webhook HMAC state
    const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
    const [isWebhookLoading, setIsWebhookLoading] = useState(false);
    const [isScheduleSaving, setIsScheduleSaving] = useState(false);
    const [isRegeneratingWebhook, setIsRegeneratingWebhook] = useState(false);
    const [isLoadingBuildOutput, setIsLoadingBuildOutput] = useState(false);
    const [terminalLaunchStage, setTerminalLaunchStage] = useState<'saving' | 'preparing' | 'opening' | null>(null);
    const activeScriptRef = useRef(activeScript);
    const activeScriptIdRef = useRef(activeScriptId);
    const scriptContentRef = useRef(scriptContent);
    activeScriptRef.current = activeScript;
    activeScriptIdRef.current = activeScriptId;
    scriptContentRef.current = scriptContent;
    const openTerminalPanel = useCallback(() => {
        setIsTerminalOpen(true);
        setIsTerminalMinimized(false);
        dispatch(setActiveDockTab('terminal'));
    }, [dispatch]);

    // Mount-order invariant: BottomDock (statically imported by page.tsx) renders
    // these pane containers before this dynamically-imported component resolves,
    // so a one-shot getElementById lookup on mount is safe — no retry needed.
    useEffect(() => {
        const terminal = document.getElementById(DOCK_PANE_IDS.terminal);
        const output = document.getElementById(DOCK_PANE_IDS.output);
        const builds = document.getElementById(DOCK_PANE_IDS.builds);
        if (terminal && output && builds) {
            setDockPaneEls({ terminal, output, builds });
        }
    }, []);

    // Initial data fetching is centralized in page.tsx

    useEffect(() => {
        if (activeScriptId) {
            setShowRunDialog(false);
            setRevealedSecret(null);
            setBuildOutput('');
            buildOutputBufferRef.current = '';

            dispatch(fetchScriptContent(activeScriptId));
            dispatch(fetchBuilds(activeScriptId));
            dispatch(fetchSchedule(activeScriptId));
            dispatch(fetchEnvVars(activeScriptId));

            if (buildSocketRef.current?.readyState === WebSocket.OPEN && activeBuildSubscriptionRef.current) {
                buildSocketRef.current.send(JSON.stringify({ type: 'unsubscribe', buildId: activeBuildSubscriptionRef.current }));
                activeBuildSubscriptionRef.current = null;
            }

            // Load language + parameter settings from script
            // (activeScript selector provides the current value; the separate useEffect below keeps it in sync)
            const currentScript = scripts.find(s => s.id === activeScriptId);
            if (currentScript) {
                setScriptLanguage(currentScript.language || 'python');
                setCustomInterpreter(currentScript.interpreter || '');
                setScriptParameters(currentScript.parameters || []);
                setTimeoutSecs(currentScript.timeout_ms ? String(currentScript.timeout_ms / 1000) : '');
            }
        }
    }, [activeScriptId, dispatch]);

    useEffect(() => {
        if (!shouldPollDesktopBuildHistory(isDesktopRuntime, activeScriptId)) {
            return;
        }

        let inFlight = false;
        const refresh = () => {
            if (inFlight) return;
            inFlight = true;
            void dispatch(fetchBuilds(activeScriptId)).finally(() => {
                inFlight = false;
            });
        };
        const timer = window.setInterval(refresh, DESKTOP_BUILD_HISTORY_POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [activeScriptId, dispatch, isDesktopRuntime]);

    useEffect(() => {
        setScriptContent(activeScriptContent || '');
    }, [activeScriptId, activeScriptContent]);

    useEffect(() => {
        if (!isDesktopRuntime) return;

        return subscribeToCanonicalFolderChanges((change) => {
            const currentActiveScript = activeScriptRef.current;
            const currentActiveScriptId = activeScriptIdRef.current;
            const effect = getCanonicalFolderChangeEffect({
                change,
                activeScriptId: currentActiveScriptId,
                activeSourcePath: currentActiveScript?.source_path,
                editorContent: scriptContentRef.current,
                persistedContent: currentActiveScript?.content || '',
            });

            if (effect.refreshWorkspace) {
                void Promise.all([dispatch(fetchScripts()), dispatch(fetchCollections())]);
            }
            if (effect.reload === 'ignore' || !currentActiveScriptId) return;

            if (effect.reload === 'recover' && currentActiveScript?.source_path) {
                void saveCanonicalRecoveryDraft({
                    scriptId: currentActiveScriptId,
                    sourcePath: currentActiveScript.source_path,
                    sourceRevision: currentActiveScript.updated_at,
                    content: scriptContentRef.current,
                }).then(() => {
                    setCanonicalFolderNotice('External change detected. Your unsaved editor buffer was saved as a recovery draft.')
                }).catch(() => {
                    setCanonicalFolderNotice('External change detected, but the recovery draft could not be saved.')
                })
            } else {
                setCanonicalFolderNotice('External change detected. Reloading the canonical script file.')
            }

            dispatch(fetchScriptContent(currentActiveScriptId));
        });
    }, [dispatch, isDesktopRuntime]);

    useEffect(() => {
        if (!isDesktopRuntime || !activeScriptId) {
            setRecoveryDrafts([]);
            return;
        }
        let cancelled = false;
        void listCanonicalRecoveryDrafts(activeScriptId).then((drafts) => {
            if (!cancelled) setRecoveryDrafts(drafts);
        }).catch(() => {
            if (!cancelled) setRecoveryDrafts([]);
        });
        return () => { cancelled = true; };
    }, [activeScriptId, canonicalFolderNotice, isDesktopRuntime]);

    const handleRestoreRecoveryDraft = useCallback((draft: CanonicalRecoveryDraft) => {
        setScriptContent(draft.content);
        setCanonicalFolderNotice('Recovery draft restored to the editor. Save to write it to the canonical file.');
    }, []);

    const handleDiscardRecoveryDraft = useCallback(async (draftId: string) => {
        await discardCanonicalRecoveryDraft(draftId);
        setRecoveryDrafts((drafts) => drafts.filter((draft) => draft.id !== draftId));
    }, []);

    // Also update language + params when active script updates (after fetch)
    useEffect(() => {
        if (activeScript) {
            setScriptLanguage(activeScript.language || 'python');
            setCustomInterpreter(activeScript.interpreter || '');
            setScriptParameters(activeScript.parameters || []);
            setTimeoutSecs(activeScript.timeout_ms ? String(activeScript.timeout_ms / 1000) : '');
        }
    }, [activeScript]);

    useEffect(() => {
        setCronExpression(schedule.cron);
        setScheduleEnabled(schedule.enabled);
    }, [schedule]);

    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [buildOutput]);

    useEffect(() => {
        return () => {
            if (buildOutputFlushTimerRef.current) {
                clearTimeout(buildOutputFlushTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isDesktopRuntime) {
            return;
        }

        if (!isTerminalOpen) {
            return;
        }

        setDesktopTerminalContext(activeScriptId ?? null, activeTerminalSessionId).catch(() => undefined);
    }, [activeScriptId, activeTerminalSessionId, isDesktopRuntime, isTerminalOpen]);

    useEffect(() => {
        const handleOpenTerminal = () => {
            openTerminalPanel();
        };

        window.addEventListener('scriptmanager:open-terminal', handleOpenTerminal);
        return () => window.removeEventListener('scriptmanager:open-terminal', handleOpenTerminal);
    }, [openTerminalPanel]);

    const flushBuildOutput = useCallback(() => {
        if (!buildOutputBufferRef.current) return;
        const buffered = buildOutputBufferRef.current;
        buildOutputBufferRef.current = '';
        setBuildOutput((current) => current + buffered);
        buildOutputFlushTimerRef.current = null;
    }, []);

    const queueBuildOutput = useCallback((chunk: string) => {
        buildOutputBufferRef.current += chunk;
        if (buildOutputFlushTimerRef.current) return;
        buildOutputFlushTimerRef.current = setTimeout(() => {
            flushBuildOutput();
        }, 40);
    }, [flushBuildOutput]);

    useEffect(() => {
        if (isDesktopRuntime || !shouldConnectBuildSocket) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/api/build-stream`);
        buildSocketRef.current = socket;

        socket.onopen = () => {
            if (pendingBuildSubscriptionRef.current) {
                socket.send(JSON.stringify({ type: 'subscribe', buildId: pendingBuildSubscriptionRef.current }));
                activeBuildSubscriptionRef.current = pendingBuildSubscriptionRef.current;
            }
        };

        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data) as { type: string; buildId?: string; line?: string; message?: string };
                if (payload.buildId && activeBuildSubscriptionRef.current && payload.buildId !== activeBuildSubscriptionRef.current) {
                    return;
                }

                if (payload.type === 'line' && typeof payload.line === 'string') {
                    queueBuildOutput(payload.line);
                    return;
                }

                if (payload.type === 'done' && activeBuildSubscriptionRef.current && activeScriptId) {
                    const completedBuildId = activeBuildSubscriptionRef.current;
                    activeBuildSubscriptionRef.current = null;
                    pendingBuildSubscriptionRef.current = null;
                    dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId: completedBuildId })).then((result) => {
                        if (fetchBuildOutput.fulfilled.match(result)) {
                            setBuildOutput(result.payload);
                            buildOutputBufferRef.current = '';
                        }
                    });
                    dispatch(fetchBuilds(activeScriptId));
                    return;
                }

                if (payload.type === 'error') {
                    queueBuildOutput(`\n[${payload.message ?? 'Build stream error'}]`);
                }
            } catch {
                queueBuildOutput('\n[Build socket message parse error]');
            }
        };

        socket.onclose = () => {
            if (activeBuildSubscriptionRef.current) {
                queueBuildOutput('\n[Build stream connection closed]');
            }
        };

        return () => {
            socket.close();
            buildSocketRef.current = null;
            activeBuildSubscriptionRef.current = null;
            pendingBuildSubscriptionRef.current = null;
        };
    }, [activeScriptId, dispatch, isDesktopRuntime, queueBuildOutput, shouldConnectBuildSocket]);

    useEffect(() => {
        if (!isDesktopRuntime) {
            return;
        }

        return subscribeToDesktopBuildEvents((payload) => {
            if (payload.type === 'started') {
                pendingBuildSubscriptionRef.current = payload.buildId;
                activeBuildSubscriptionRef.current = payload.buildId;
                dispatch(setRunStatus('running'));
                return;
            }

            if (payload.type === 'line') {
                if (activeBuildSubscriptionRef.current && payload.buildId !== activeBuildSubscriptionRef.current) {
                    return;
                }
                queueBuildOutput(payload.line);
                return;
            }

            if (payload.type === 'error') {
                if (activeBuildSubscriptionRef.current && payload.buildId !== activeBuildSubscriptionRef.current) {
                    return;
                }
                queueBuildOutput(`\n[${payload.message}]`);
                return;
            }

            if (payload.type === 'done') {
                if (activeBuildSubscriptionRef.current && payload.buildId !== activeBuildSubscriptionRef.current) {
                    return;
                }
                dispatch(setRunStatus('idle'));
                pendingBuildSubscriptionRef.current = null;
                activeBuildSubscriptionRef.current = null;
                if (activeScriptId) {
                    dispatch(fetchBuilds(activeScriptId));
                    dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId: payload.buildId })).then((result) => {
                        if (fetchBuildOutput.fulfilled.match(result)) {
                            setBuildOutput(result.payload);
                            buildOutputBufferRef.current = '';
                        }
                    });
                }
            }
        });
    }, [activeScriptId, dispatch, isDesktopRuntime, queueBuildOutput]);

    useEffect(() => {
        if (isDesktopRuntime) {
            setShouldConnectBuildSocket(false);
        }
    }, [isDesktopRuntime]);

    const handleSave = async (options: { skipGist?: boolean, isAutoSave?: boolean } = {}) => {
        if (activeScriptId) {
            const script = activeScript;
            if (script) {
                const timeoutMs = timeoutSecs.trim() ? Math.round(parseFloat(timeoutSecs) * 1000) : null;
                try {
                    await dispatch(saveScript({
                        id: activeScriptId,
                        name: script.name,
                        content: scriptContent,
                        sync_to_gist: script.sync_to_gist,
                        language: scriptLanguage,
                        interpreter: scriptLanguage === 'custom' ? customInterpreter : null,
                        parameters: scriptParameters,
                        timeout_ms: timeoutMs,
                        skipGist: options.skipGist
                    })).unwrap();

                    // Refresh version list only if the user has already opened/loaded it.
                    if (!options.isAutoSave && versionsStatus !== 'idle') {
                        dispatch(fetchVersions(activeScriptId));
                    }
                    if (!options.skipGist) {
                        setGistDirty(false);
                    }
                    return true;
                } catch (error) {
                    if (!options.isAutoSave) {
                        toast.error(getOperationError(error, 'Failed to save script'));
                    }
                }
            }
        }
        return false;
    };

    const handleExportScript = useCallback(async () => {
        if (!activeScriptId) return;
        try {
            const bundle = await exportScriptRuntime(activeScriptId);
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const name = typeof bundle.name === 'string' && bundle.name.trim() ? bundle.name : 'script';
            anchor.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.scriptmanager.json`;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
        } catch (error) {
            setCanonicalFolderNotice(error instanceof Error ? error.message : 'Failed to export script');
        }
    }, [activeScriptId]);

    // Auto-save effect (Local DB only)
    useEffect(() => {
        if (!autoSaveEnabled || !activeScriptId || saveStatus === 'saving') return;
        if (!activeScript) return;

        const savedContent = activeScript.content || '';
        if (savedContent === scriptContent) return; // Not dirty

        const timer = setTimeout(() => {
            // Save locally, skip Gist
            handleSave({ skipGist: true, isAutoSave: true });
            // Mark Gist as dirty if Gist sync is enabled
            if (activeScript.sync_to_gist) {
                setGistDirty(true);
            }
        }, 2000); // 2 seconds debounce

        return () => clearTimeout(timer);
    }, [scriptContent, autoSaveEnabled, activeScriptId, activeScript, saveStatus, scriptLanguage, customInterpreter, scriptParameters, timeoutSecs]);

    // Gist Sync Interval Effect (Every 10 mins)
    useEffect(() => {
        const timer = setInterval(() => {
            if (activeScriptId && gistDirty && activeScript?.sync_to_gist) {
                console.log('[Gist] Auto-syncing to Gist...');
                handleSave({ skipGist: false });
            }
        }, 10 * 60 * 1000); // 10 minutes

        return () => clearInterval(timer);
    }, [activeScriptId, gistDirty, activeScript]);

    // Sync Gist on unmount or script change
    useEffect(() => {
        return () => {
            if (activeScriptId && gistDirty && activeScript?.sync_to_gist) {
                console.log('[Gist] Syncing on close/change...');
                handleSave({ skipGist: false });
            }
        };
    }, [activeScriptId, gistDirty, activeScript]);

    const toggleGistSync = async (enabled: boolean) => {
        try {
            setIsGistSyncing(true);
            if (enabled) {
                const gistSettings = await readGithubGistSettingsRuntime();
                if (!gistSettings.configured) {
                    alert("Please configure your GitHub Token in Settings first.");
                    return;
                }
            }
            if (activeScriptId && activeScript) {
                await dispatch(saveScript({
                    id: activeScriptId,
                    name: activeScript.name,
                    content: scriptContent,
                    sync_to_gist: enabled,
                    language: scriptLanguage,
                    interpreter: scriptLanguage === 'custom' ? customInterpreter : null
                })).unwrap();
            }
        } catch (error) {
            toast.error(getOperationError(error, 'Failed to update Gist sync'));
        } finally {
            setIsGistSyncing(false);
        }
    }

    const handleScheduleSave = async () => {
        if (activeScriptId) {
            setIsScheduleSaving(true);
            try {
                await dispatch(saveSchedule({ scriptId: activeScriptId, cron: cronExpression, enabled: scheduleEnabled })).unwrap();
                toast.success('Schedule saved');
            } catch (error) {
                toast.error(getOperationError(error, 'Failed to save schedule'));
            } finally {
                setIsScheduleSaving(false);
            }
        }
    }

    const handleRegenerateWebhook = async () => {
        if (activeScriptId && confirm("Regenerate webhook URL? The old one will stop working.")) {
            setIsRegeneratingWebhook(true);
            try {
                await dispatch(regenerateWebhook(activeScriptId)).unwrap();
                toast.success('Webhook token regenerated');
            } catch (error) {
                toast.error(getOperationError(error, 'Failed to regenerate webhook token'));
            } finally {
                setIsRegeneratingWebhook(false);
            }
        }
    }

    const handleToggleWebhookSignature = useCallback(async (checked: boolean) => {
        if (!activeScriptId) return;
        setIsWebhookLoading(true);
        try {
            const result = await dispatch(toggleWebhookSignature({ scriptId: activeScriptId, requireSignature: checked })).unwrap();
            if (result.webhook_secret) {
                setRevealedSecret(result.webhook_secret);
            }
        } catch (error) {
            toast.error(getOperationError(error, 'Failed to update webhook signature settings'));
        } finally {
            setIsWebhookLoading(false);
        }
    }, [activeScriptId, dispatch]);

    const handleRotateWebhookSecret = useCallback(async () => {
        if (!activeScriptId) return;
        try {
            const result = await dispatch(regenerateWebhookSecret(activeScriptId)).unwrap();
            setRevealedSecret(result.secret);
        } catch (error) {
            toast.error(getOperationError(error, 'Failed to rotate webhook secret'));
        }
    }, [activeScriptId, dispatch]);

    const handleAddTag = useCallback((name: string) => {
        if (!activeScriptId) return;
        void dispatch(addTagToScript({ scriptId: activeScriptId, name })).unwrap().catch((error) => {
            toast.error(getOperationError(error, 'Failed to add tag'));
        });
    }, [activeScriptId, dispatch]);

    const handleRemoveTag = useCallback((tagId: string) => {
        if (!activeScriptId) return;
        void dispatch(removeTagFromScript({ scriptId: activeScriptId, tagId })).unwrap().catch((error) => {
            toast.error(getOperationError(error, 'Failed to remove tag'));
        });
    }, [activeScriptId, dispatch]);

    const handleAddEnvVar = useCallback((key: string, value: string, isSecret: boolean) => {
        if (!activeScriptId) return;
        void dispatch(upsertEnvVar({ scriptId: activeScriptId, key, value, isSecret })).unwrap().catch((error) => {
            toast.error(getOperationError(error, 'Failed to save environment variable'));
        });
    }, [activeScriptId, dispatch]);

    const handleDeleteEnvVar = useCallback((key: string) => {
        if (!activeScriptId) return;
        void dispatch(deleteEnvVar({ scriptId: activeScriptId, key })).unwrap().catch((error) => {
            toast.error(getOperationError(error, 'Failed to delete environment variable'));
        });
    }, [activeScriptId, dispatch]);

    const handleRestoreVersionContent = useCallback((content: string) => {
        setScriptContent(content);
    }, []);

    const executeRun = async (paramValues: Record<string, string>) => {
        if (!activeScriptId) return;

        if (!isDesktopRuntime && !shouldConnectBuildSocket) {
            setShouldConnectBuildSocket(true);
        }

        if (!isDesktopRuntime && buildSocketRef.current?.readyState === WebSocket.OPEN && activeBuildSubscriptionRef.current) {
            buildSocketRef.current.send(JSON.stringify({ type: 'unsubscribe', buildId: activeBuildSubscriptionRef.current }));
        }
        activeBuildSubscriptionRef.current = null;
        pendingBuildSubscriptionRef.current = null;

        dispatch(setActiveDockTab('output'));
        setBuildOutput('[Starting run... waiting for live output]\n');
        buildOutputBufferRef.current = '';
        const buildId = uuidv4();
        if (!isDesktopRuntime) {
            pendingBuildSubscriptionRef.current = buildId;
        }
        if (!isDesktopRuntime && buildSocketRef.current?.readyState === WebSocket.OPEN) {
            buildSocketRef.current.send(JSON.stringify({ type: 'subscribe', buildId }));
            activeBuildSubscriptionRef.current = buildId;
        }

        if (isDesktopRuntime) {
            dispatch(setRunStatus('running'));
            try {
                const result = await startDesktopLocalRun(activeScriptId, paramValues, buildId);
                activeBuildSubscriptionRef.current = result.buildId;
                pendingBuildSubscriptionRef.current = result.buildId;
            } catch (error) {
                dispatch(setRunStatus('idle'));
                queueBuildOutput(`\n[Failed to start run: ${error instanceof Error ? error.message : 'Unknown error'}]`);
            }
            return;
        }

        const resultAction = await dispatch(runScript({ id: activeScriptId, paramValues, buildId }));

        if (runScript.fulfilled.match(resultAction)) {
            // Build history will refresh when the run completes.
        } else {
            if (buildSocketRef.current?.readyState === WebSocket.OPEN) {
                buildSocketRef.current.send(JSON.stringify({ type: 'unsubscribe', buildId }));
            }
            activeBuildSubscriptionRef.current = null;
            pendingBuildSubscriptionRef.current = null;
            queueBuildOutput('\n[Failed to start run]');
        }
    };

    const handleCancelRun = useCallback(async () => {
        const buildId = activeBuildSubscriptionRef.current;
        if (!buildId) return;
        await cancelDesktopRun(buildId).catch((error) => {
            setCanonicalFolderNotice(error instanceof Error ? error.message : 'Failed to cancel run');
        });
    }, []);

    const handleRun = async () => {
        if (!activeScriptId) return;
        if (isDesktopRuntime) {
            await handleRunInTerminal();
            return;
        }
        setRunTarget('background');
        // If the script has parameters, show the fill-in dialog first
        if (scriptParameters.length > 0) {
            setShowRunDialog(true);
            return;
        }
        // No parameters — run immediately
        await executeRun({});
    };

    // Command palette / Ctrl+Enter "Run Active Script" — mirrors the
    // 'scriptmanager:open-terminal' event pattern. Ref keeps the listener
    // stable while handleRun is recreated every render.
    const handleRunRef = useRef(handleRun);
    handleRunRef.current = handleRun;
    useEffect(() => {
        const onRunActiveScript = () => { void handleRunRef.current(); };
        window.addEventListener('scriptmanager:run-active-script', onRunActiveScript);
        return () => window.removeEventListener('scriptmanager:run-active-script', onRunActiveScript);
    }, []);

    const executeRunInTerminal = async (paramValues: Record<string, string>) => {
        if (!activeScriptId) return;

        setTerminalLaunchStage('saving');
        const saved = await handleSave({ skipGist: true });
        if (!saved) {
            setTerminalLaunchStage(null);
            return;
        }

        setTerminalLaunchStage('preparing');
        setTerminalLaunchStage('opening');
        openTerminalPanel();
        if (isDesktopRuntime) {
            try {
                await runScriptInDesktopTerminal(activeScriptId, paramValues, activeTerminalSessionId);
            } catch (error) {
                setTerminalLaunchStage(null);
                alert(error instanceof Error ? error.message : 'Failed to start terminal run');
                return;
            }
            setPendingTerminalCommand(null);
            setTerminalLaunchStage(null);
            return;
        }

        try {
            const data = await buildBrowserTerminalCommand(activeScriptId, paramValues)
            setPendingTerminalCommand({ sessionId: activeTerminalSessionId, command: data.command });
        } catch (error) {
            setTerminalLaunchStage(null);
            alert(error instanceof Error ? error.message : 'Failed to build terminal command');
        }
    };

    const handleRunInTerminal = async () => {
        if (!activeScriptId) return;
        setRunTarget('terminal');

        if (scriptParameters.length > 0) {
            setShowRunDialog(true);
            return;
        }

        await executeRunInTerminal({});
    };

    const handleBuildClick = useCallback(async (buildId: string) => {
        if (!activeScriptId) return;
        setIsLoadingBuildOutput(true);
        try {
            const output = await dispatch(fetchBuildOutput({ scriptId: activeScriptId, buildId })).unwrap();
            setBuildOutput(output);
            buildOutputBufferRef.current = '';
            dispatch(setActiveDockTab('output'));
        } catch (error) {
            toast.error(getOperationError(error, 'Failed to load build output'));
        } finally {
            setIsLoadingBuildOutput(false);
        }
    }, [activeScriptId, dispatch]);

    const handleMoveScript = async (collectionId: string) => {
        if (activeScriptId) {
            try {
                await dispatch(moveScript({
                    scriptId: activeScriptId,
                    collectionId: collectionId === 'unsorted' ? null : collectionId
                })).unwrap();
            } catch (error) {
                toast.error(getOperationError(error, 'Failed to move script'));
            }
        }
    }

    const webhookUrl = isDesktopRuntime
        ? 'Unavailable in desktop mode'
        : activeScript?.webhook_token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${activeScript.webhook_token}`
        : 'No webhook generated yet';

    const activeActionFeedback = useMemo(() => {
        if (terminalLaunchStage === 'saving') {
            return { tone: 'blue', text: 'Saving script before terminal launch...' };
        }
        if (terminalLaunchStage === 'preparing') {
            return { tone: 'blue', text: 'Preparing terminal command...' };
        }
        if (terminalLaunchStage === 'opening') {
            return { tone: 'blue', text: 'Opening terminal session...' };
        }
        if (contentStatus === 'loading') {
            return { tone: 'blue', text: 'Loading script and related data...' };
        }
        if (runStatus === 'running') {
            return { tone: 'green', text: 'Starting script run and streaming output...' };
        }
        if (saveStatus === 'saving') {
            return { tone: 'blue', text: 'Saving changes...' };
        }
        if (isScheduleSaving) {
            return { tone: 'amber', text: 'Saving schedule...' };
        }
        if (isRegeneratingWebhook) {
            return { tone: 'amber', text: 'Regenerating webhook token...' };
        }
        if (isWebhookLoading) {
            return { tone: 'amber', text: 'Updating webhook signature settings...' };
        }
        if (isLoadingBuildOutput) {
            return { tone: 'slate', text: 'Loading build output...' };
        }
        if (isGistSyncing) {
            return { tone: 'slate', text: 'Syncing with GitHub Gist...' };
        }
        return null;
    }, [contentStatus, isGistSyncing, isLoadingBuildOutput, isRegeneratingWebhook, isScheduleSaving, isWebhookLoading, runStatus, saveStatus, terminalLaunchStage]);

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
        <div className="flex h-full bg-white dark:bg-slate-950 overflow-hidden">
            {/* ── Left Sidebar (skipped when hosted in the workbench SidePanel) ── */}
            {!hideSidebar && (
                <div className="w-[250px] flex-shrink-0 border-r dark:border-slate-800">
                    <ScriptsSidebar />
                </div>
            )}

            {/* ── Main Editor Area ── */}
            <div className="flex-1 min-w-0 flex flex-col relative h-full">
                <div className="h-full flex flex-col">
                    {activeScriptId ? (
                        <>
                        <div className="border-b px-4 py-2 flex items-center justify-between gap-3 bg-white dark:bg-slate-950 dark:border-slate-800">
                            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                                <span className="min-w-0 max-w-[320px] truncate font-semibold text-sm text-slate-700 dark:text-slate-200" title={activeScript?.name}>
                                    {activeScript?.name}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Folder className="h-3.5 w-3.5 text-slate-400" />
                                    <Select
                                        value={activeScript?.collection_id || 'unsorted'}
                                        onValueChange={handleMoveScript}
                                    >
                                        <SelectTrigger className="h-6 w-[160px] text-xs border-slate-200">
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
                                <div className="flex shrink-0 items-center gap-1.5">
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
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                {activeScript?.gist_url && (
                                    <a href={activeScript.gist_url} target="_blank" rel="noopener noreferrer" className="mr-2 flex items-center gap-1 text-xs text-blue-600 hover:underline" title="View on GitHub Gist">
                                        <Github className="h-3.5 w-3.5" />
                                    </a>
                                )}

                                <div className="mr-4 flex shrink-0 flex-col items-center gap-1" title="Sync to GitHub Gist">
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
                                    className="h-7 shrink-0 text-xs gap-1"
                                    title="Export script as JSON"
                                    onClick={() => void handleExportScript()}
                                >
                                    <Download className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs gap-1" onClick={() => handleSave({ skipGist: false })} disabled={saveStatus === 'saving'}>
                                    {saveStatus === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                                </Button>
                                <Button size="sm" className="h-7 shrink-0 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleRun} disabled={runStatus === 'running' || terminalLaunchStage !== null}>
                                    {(runStatus === 'running' || terminalLaunchStage) ? <Loader2 className="h-3 w-3 animate-spin" /> : (isDesktopRuntime ? <Terminal className="h-3 w-3" /> : <Play className="h-3 w-3" />)}
                                    {isDesktopRuntime
                                        ? terminalLaunchStage === 'saving'
                                            ? 'Saving...'
                                            : terminalLaunchStage === 'preparing'
                                                ? 'Preparing...'
                                                : terminalLaunchStage === 'opening'
                                                    ? 'Opening...'
                                                    : 'Run'
                                        : runStatus === 'running'
                                            ? 'Running...'
                                            : 'Run'}
                                </Button>
                                {isDesktopRuntime && runStatus === 'running' && (
                                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => void handleCancelRun()}>
                                        Cancel
                                    </Button>
                                )}
                                {!isDesktopRuntime && (
                                    <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs gap-1" onClick={handleRunInTerminal} disabled={terminalLaunchStage !== null}>
                                        {terminalLaunchStage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Terminal className="h-3 w-3" />}
                                        {terminalLaunchStage === 'saving'
                                            ? 'Saving...'
                                            : terminalLaunchStage === 'preparing'
                                                ? 'Preparing...'
                                                : terminalLaunchStage === 'opening'
                                                    ? 'Opening...'
                                                    : 'Run in Terminal'}
                                    </Button>
                                )}
                            </div>
                        </div>
                        {activeActionFeedback && (
                            <div className={cn(
                                "flex items-center gap-2 border-b px-4 py-1.5 text-[11px]",
                                activeActionFeedback.tone === 'green' && "border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-950/20 dark:text-green-300",
                                activeActionFeedback.tone === 'amber' && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300",
                                activeActionFeedback.tone === 'slate' && "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300",
                                activeActionFeedback.tone === 'blue' && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300"
                            )}>
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                <span>{activeActionFeedback.text}</span>
                            </div>
                        )}
                        {canonicalFolderNotice && (
                            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                                <span>{canonicalFolderNotice}</span>
                            </div>
                        )}
                        {activeScript?.source_path && activeScript.source_available === false && (
                            <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                                <Folder className="h-4 w-4 shrink-0" />
                                <span>The canonical source file is unavailable. Restore or re-import the file before saving or running this script.</span>
                            </div>
                        )}
                        </>
                    ) : null}
                    <div className="flex-1 flex flex-col relative overflow-hidden">
                        <div className="flex-1 relative min-h-0">
                            {activeScriptId ? (
                                contentStatus === 'loading' ? (
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
                                        value={scriptContent || ''}
                                        onChange={(value) => setScriptContent(value || '')}
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
                                )
                            ) : (
                                <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                                    <div className="flex flex-col items-center gap-2">
                                        <span>Select a script to start editing</span>
                                        <span className="text-xs">
                                            or click <span className="font-semibold">+</span> in the sidebar to create one
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Right Panel ── */}
            <div className="w-[350px] flex-shrink-0 border-l dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {activeScriptId && (
                        <>
                            <ScriptInspectorSection
                                activeScript={activeScript}
                                activeScriptId={activeScriptId}
                                allTags={allTags}
                                cronExpression={cronExpression}
                                envVars={envVars}
                                handleRegenerateWebhook={handleRegenerateWebhook}
                                handleScheduleSave={handleScheduleSave}
                                handleToggleWebhookSignature={handleToggleWebhookSignature}
                                handleRotateWebhookSecret={handleRotateWebhookSecret}
                                handleAddTag={handleAddTag}
                                handleRemoveTag={handleRemoveTag}
                                handleAddEnvVar={handleAddEnvVar}
                                handleDeleteEnvVar={handleDeleteEnvVar}
                                isRegeneratingWebhook={isRegeneratingWebhook}
                                isScheduleSaving={isScheduleSaving}
                                isWebhookLoading={isWebhookLoading}
                                revealedSecret={revealedSecret}
                                scheduleEnabled={scheduleEnabled}
                                scriptParameters={scriptParameters}
                                setCronExpression={setCronExpression}
                                setScheduleEnabled={setScheduleEnabled}
                                setScriptParameters={setScriptParameters}
                                timeoutSecs={timeoutSecs}
                                setTimeoutSecs={setTimeoutSecs}
                                webhookUrl={webhookUrl}
                                desktopRuntime={isDesktopRuntime}
                            />
                            <VersionHistorySection
                                activeScriptId={activeScriptId}
                                currentContent={deferredScriptContent}
                                language={scriptLanguage}
                                onRestore={handleRestoreVersionContent}
                            />
                            {isDesktopRuntime && recoveryDrafts.length > 0 && (
                                <div className="border-b bg-amber-50 p-4 dark:border-slate-800 dark:bg-amber-950/10">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm font-medium text-amber-900 dark:text-amber-200">Recovery Drafts</span>
                                        <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{recoveryDrafts.length}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {recoveryDrafts.map((draft) => (
                                            <div key={draft.id} className="rounded border border-amber-200 bg-white p-2 dark:border-amber-900/40 dark:bg-slate-900">
                                                <p className="mb-2 text-[11px] text-slate-500">{new Date(draft.createdAt).toLocaleString()}</p>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRestoreRecoveryDraft(draft)}>Restore</Button>
                                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => void handleDiscardRecoveryDraft(draft.id)}>Discard</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Bottom dock panes (portaled into the workbench BottomDock) ── */}
            {dockPaneEls && createPortal(
                isTerminalOpen ? (
                    <TerminalComponent
                        className="h-full"
                        isVisible={true}
                        isMinimized={isTerminalMinimized}
                        toggleMinimize={() => setIsTerminalMinimized(!isTerminalMinimized)}
                        onClose={() => setIsTerminalOpen(false)}
                        pendingCommand={pendingTerminalCommand}
                        onActiveSessionChange={setActiveTerminalSessionId}
                        onCommandSent={() => {
                            setPendingTerminalCommand(null);
                            setTerminalLaunchStage(null);
                        }}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={openTerminalPanel}>
                            <Terminal className="h-3 w-3" /> Open Terminal
                        </Button>
                    </div>
                ),
                dockPaneEls.terminal
            )}
            {dockPaneEls && createPortal(
                !isDesktopRuntime ? (
                    <ConsoleOutputSection
                        consoleRef={consoleRef}
                        buildOutput={buildOutput}
                        runStatus={runStatus}
                        terminalLaunchStage={terminalLaunchStage}
                        isLoadingBuildOutput={isLoadingBuildOutput}
                        isTerminalOpen={isTerminalOpen}
                        isTerminalMinimized={isTerminalMinimized}
                        onOpenTerminal={openTerminalPanel}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-500 italic">
                        Desktop runs stream to the Terminal pane
                    </div>
                ),
                dockPaneEls.output
            )}
            {dockPaneEls && createPortal(
                <BuildHistorySection desktopRuntime={isDesktopRuntime} builds={builds} onBuildClick={handleBuildClick} />,
                dockPaneEls.builds
            )}

            {/* Run Inputs Dialog — shown when script has parameters */}
            <RunInputsDialog
                key={activeScriptId ?? 'none'}
                open={showRunDialog}
                parameters={scriptParameters}
                onRun={(values) => {
                    setShowRunDialog(false);
                    if (runTarget === 'terminal') {
                        executeRunInTerminal(values);
                    } else {
                        executeRun(values);
                    }
                }}
                onCancel={() => setShowRunDialog(false)}
            />
        </div>
    );
};
