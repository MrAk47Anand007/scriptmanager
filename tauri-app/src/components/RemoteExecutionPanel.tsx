

import { useState, useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { hasDesktopOpsRuntime, subscribeToDesktopRemoteExec } from '@/lib/opsRuntimeClient'
import {
    testConnection, transferScript, startRemoteExec,
    appendRemoteExecOutput, clearRemoteExecOutput, setRemoteExecStatus,
    clearApprovalState,
} from '@/features/ops/opsSlice'
import {
    selectSelectedProfileId, selectServerProfiles, selectRemoteExecStatus,
    selectRemoteExecOutput, selectConnectionTestResult, selectCurrentRemoteExecId,
    selectRequiresApproval, selectPendingApprovalEnvironment,
} from '@/features/ops/selectors'
import { selectActiveScriptId, selectScriptItems } from '@/features/scripts/selectors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Terminal, Wifi, Upload, Play, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { ApprovalGateDialog } from './ApprovalGateDialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const CHMOD_PRESETS = [
    { value: '755', label: '755 — rwxr-xr-x' },
    { value: '700', label: '700 — rwx------' },
    { value: '644', label: '644 — rw-r--r--' },
    { value: 'custom', label: 'Custom…' },
]

export function RemoteExecutionPanel() {
    const dispatch = useAppDispatch()
    const selectedProfileId = useAppSelector(selectSelectedProfileId)
    const serverProfiles = useAppSelector(selectServerProfiles)
    const remoteExecStatus = useAppSelector(selectRemoteExecStatus)
    const remoteExecOutput = useAppSelector(selectRemoteExecOutput)
    const connectionTestResult = useAppSelector(selectConnectionTestResult)
    const currentRemoteExecId = useAppSelector(selectCurrentRemoteExecId)
    const requiresApproval = useAppSelector(selectRequiresApproval)
    const pendingApprovalEnvironment = useAppSelector(selectPendingApprovalEnvironment)
    const activeScriptId = useAppSelector(selectActiveScriptId)
    const scripts = useAppSelector(selectScriptItems)

    const [isExpanded, setIsExpanded] = useState(true)
    const [remotePath, setRemotePath] = useState('/tmp/')
    const [chmodPreset, setChmodPreset] = useState('755')
    const [customChmod, setCustomChmod] = useState('')
    const outputRef = useRef<HTMLPreElement>(null)
    const esRef = useRef<EventSource | null>(null)

    const selectedProfile = serverProfiles.find(p => p.id === selectedProfileId)
    const activeScript = scripts.find(s => s.id === activeScriptId)

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [remoteExecOutput])

    // Open SSE stream when a remote exec starts (non-approval path)
    useEffect(() => {
        if (!currentRemoteExecId || remoteExecStatus !== 'running') return

        if (hasDesktopOpsRuntime()) {
            dispatch(clearRemoteExecOutput())
            const unsubscribe = subscribeToDesktopRemoteExec((event) => {
                if (event.type === 'line' && event.remoteExecId === currentRemoteExecId) {
                    dispatch(appendRemoteExecOutput(event.line))
                }
                if (event.type === 'done' && event.remoteExecId === currentRemoteExecId) {
                    dispatch(setRemoteExecStatus(event.exitCode === 0 ? 'done' : 'error'))
                }
                if (event.type === 'error' && event.remoteExecId === currentRemoteExecId) {
                    dispatch(appendRemoteExecOutput(`[Error] ${event.message}\n`))
                    dispatch(setRemoteExecStatus('error'))
                }
            })
            return unsubscribe
        }

        if (esRef.current) {
            esRef.current.close()
        }

        dispatch(clearRemoteExecOutput())
        const es = new EventSource(`/api/ops/remote-exec/${currentRemoteExecId}/stream`)
        esRef.current = es

        es.onmessage = (event) => {
            if (event.data === '[DONE]') {
                es.close()
                esRef.current = null
                dispatch(setRemoteExecStatus('done'))
                return
            }
            if (event.data === '[ERROR]') {
                es.close()
                esRef.current = null
                dispatch(setRemoteExecStatus('error'))
                return
            }
            dispatch(appendRemoteExecOutput(event.data + '\n'))
        }

        es.onerror = () => {
            es.close()
            esRef.current = null
            dispatch(setRemoteExecStatus('error'))
        }

        return () => {
            es.close()
        }
    }, [currentRemoteExecId, remoteExecStatus, dispatch])

    // Also open SSE when approval is granted and status becomes 'running' again
    useEffect(() => {
        return () => {
            if (esRef.current) {
                esRef.current.close()
            }
        }
    }, [])

    const permissions = chmodPreset === 'custom' ? customChmod : chmodPreset

    const handleTestConnection = async () => {
        if (!selectedProfileId) return
        try {
            const result = await dispatch(testConnection(selectedProfileId)).unwrap()
            if (!result.success) {
                toast.error(result.error ?? 'Connection failed')
            }
        } catch (error) {
            toast.error(getOperationError(error, 'Connection test failed'))
        }
    }

    const handleTransfer = async () => {
        if (!selectedProfileId || !activeScriptId) return
        try {
            const result = await dispatch(transferScript({
                profileId: selectedProfileId,
                scriptId: activeScriptId,
                remotePath,
                permissions,
            })).unwrap()
            if (result.success) {
                dispatch(appendRemoteExecOutput(`[Transfer] Script uploaded to ${result.remote_path}\n`))
            } else {
                const message = result.error ?? 'Transfer failed'
                dispatch(appendRemoteExecOutput(`[Transfer Error] ${message}\n`))
                toast.error(message)
            }
        } catch (error) {
            const message = getOperationError(error, 'Script transfer failed')
            dispatch(appendRemoteExecOutput(`[Transfer Error] ${message}\n`))
            toast.error(message)
        }
    }

    const handleRun = async () => {
        if (!selectedProfileId || !activeScriptId) return
        dispatch(clearRemoteExecOutput())
        try {
            await dispatch(startRemoteExec({
                profileId: selectedProfileId,
                scriptId: activeScriptId,
                remotePath,
            })).unwrap()
        } catch (error) {
            toast.error(getOperationError(error, 'Remote execution failed to start'))
        }
    }

    const isRunning = remoteExecStatus === 'running' || remoteExecStatus === 'connecting'

    if (!selectedProfileId) {
        return (
            <div className="border-b dark:border-slate-700">
                <div className="px-3 py-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5">
                        <Terminal className="h-3 w-3 text-slate-400" /> Remote Execution
                    </h3>
                </div>
                <div className="px-3 pb-3">
                    <p className="text-[10px] text-slate-400 italic">Select a server profile above to enable remote execution.</p>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="border-b dark:border-slate-700">
                {/* Header */}
                <div className="px-3 py-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5">
                        <Terminal className="h-3 w-3 text-slate-400" /> Remote Execution
                        <span className="ml-1 text-[10px] text-slate-400 font-normal normal-case">
                            {selectedProfile?.name}
                        </span>
                    </h3>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded
                            ? <ChevronUp className="h-3 w-3 text-slate-400" />
                            : <ChevronDown className="h-3 w-3 text-slate-400" />
                        }
                    </Button>
                </div>

                {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                        {/* Remote path + chmod */}
                        <div className="flex gap-1.5">
                            <Input
                                value={remotePath}
                                onChange={e => setRemotePath(e.target.value)}
                                placeholder="/tmp/"
                                className="h-6 text-[10px] font-mono flex-1 bg-white dark:bg-slate-900 dark:border-slate-700"
                            />
                            <Select value={chmodPreset} onValueChange={setChmodPreset}>
                                <SelectTrigger className="h-6 w-[120px] text-[10px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CHMOD_PRESETS.map(p => (
                                        <SelectItem key={p.value} value={p.value} className="text-[10px]">
                                            {p.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {chmodPreset === 'custom' && (
                            <Input
                                value={customChmod}
                                onChange={e => setCustomChmod(e.target.value)}
                                placeholder="e.g. 750"
                                className="h-6 text-[10px] font-mono w-24 bg-white dark:bg-slate-900 dark:border-slate-700"
                            />
                        )}

                        {/* Connection test result */}
                        {connectionTestResult && (
                            <div className={cn(
                                'flex items-center gap-1.5 text-[10px] rounded px-2 py-1',
                                connectionTestResult.success
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                            )}>
                                {connectionTestResult.success
                                    ? <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    : <XCircle className="h-3 w-3 shrink-0" />
                                }
                                {connectionTestResult.success
                                    ? `Connected · ${connectionTestResult.latency_ms}ms`
                                    : connectionTestResult.error ?? 'Connection failed'
                                }
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] flex-1 gap-1"
                                disabled={remoteExecStatus === 'connecting'}
                                onClick={handleTestConnection}
                            >
                                {remoteExecStatus === 'connecting'
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Wifi className="h-3 w-3" />
                                }
                                Test
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] flex-1 gap-1"
                                disabled={!activeScriptId || isRunning}
                                onClick={handleTransfer}
                            >
                                <Upload className="h-3 w-3" />
                                Transfer
                            </Button>
                            <Button
                                size="sm"
                                className="h-6 text-[10px] flex-1 gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={!activeScriptId || isRunning}
                                onClick={handleRun}
                            >
                                {isRunning
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Play className="h-3 w-3" />
                                }
                                {isRunning ? 'Running…' : 'Run'}
                            </Button>
                        </div>

                        {/* Status badge */}
                        {remoteExecStatus !== 'idle' && (
                            <div className={cn(
                                'text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded w-fit',
                                remoteExecStatus === 'running' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                                remoteExecStatus === 'done' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                                remoteExecStatus === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                                remoteExecStatus === 'connecting' && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
                            )}>
                                {remoteExecStatus}
                            </div>
                        )}

                        {/* Remote console output */}
                        {remoteExecOutput && (
                            <pre
                                ref={outputRef}
                                className="text-[9px] font-mono bg-slate-900 dark:bg-black text-green-400 rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap"
                            >
                                {remoteExecOutput}
                            </pre>
                        )}
                    </div>
                )}
            </div>

            {/* Approval gate dialog — rendered outside the panel so it overlays correctly */}
            {requiresApproval && currentRemoteExecId && pendingApprovalEnvironment && (
                <ApprovalGateDialog
                    open={requiresApproval}
                    onClose={() => dispatch(clearApprovalState())}
                    remoteExecId={currentRemoteExecId}
                    scriptName={activeScript?.name ?? 'Unknown Script'}
                    profileName={selectedProfile?.name ?? 'Unknown Profile'}
                    serverHost={selectedProfile?.host ?? ''}
                    environment={pendingApprovalEnvironment}
                    onApproved={() => {
                        dispatch(clearRemoteExecOutput())
                        dispatch(setRemoteExecStatus('running'))
                    }}
                />
            )}
        </>
    )
}
