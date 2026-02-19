'use client'

import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchAuditLog } from '@/features/ops/opsSlice'
import { Button } from '@/components/ui/button'
import { ClipboardList, ChevronDown, ChevronUp, RefreshCw, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
    pending_approval: { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', dot: 'bg-amber-400' },
    approved:         { badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', dot: 'bg-green-400' },
    rejected:         { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', dot: 'bg-red-400' },
    running:          { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', dot: 'bg-blue-400' },
    success:          { badge: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', dot: 'bg-green-500' },
    failure:          { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', dot: 'bg-red-500' },
}

function formatRelative(isoString: string): string {
    const now = Date.now()
    const then = new Date(isoString).getTime()
    const diffMs = now - then
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return `${Math.floor(diffHr / 24)}d ago`
}

export function AuditTrailPanel() {
    const dispatch = useAppDispatch()
    const { auditLog, auditLogTotal, auditLogStatus, serverProfiles } = useAppSelector(s => s.ops)
    const { items: scripts } = useAppSelector(s => s.scripts)

    const [isExpanded, setIsExpanded] = useState(true)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
    const [filterProfileId, setFilterProfileId] = useState('')
    const [filterScriptId, setFilterScriptId] = useState('')
    const [offset, setOffset] = useState(0)

    const LIMIT = 20

    const load = (newOffset = 0) => {
        dispatch(fetchAuditLog({
            profileId: filterProfileId || undefined,
            scriptId: filterScriptId || undefined,
            limit: LIMIT,
            offset: newOffset,
        }))
        setOffset(newOffset)
    }

    useEffect(() => {
        load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterProfileId, filterScriptId])

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="border-b dark:border-slate-700">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5">
                    <ClipboardList className="h-3 w-3 text-slate-400" /> Audit Trail
                    <span className="ml-1 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-1 font-bold">
                        {auditLogTotal}
                    </span>
                </h3>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Refresh"
                        onClick={() => load(0)}
                    >
                        <RefreshCw className={cn("h-3 w-3 text-slate-400", auditLogStatus === 'loading' && "animate-spin")} />
                    </Button>
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
            </div>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                    {/* Filters */}
                    <div className="flex gap-1.5">
                        <select
                            value={filterProfileId}
                            onChange={e => setFilterProfileId(e.target.value)}
                            className="flex-1 h-6 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-1"
                        >
                            <option value="">All servers</option>
                            {serverProfiles.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterScriptId}
                            onChange={e => setFilterScriptId(e.target.value)}
                            className="flex-1 h-6 text-[10px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-1"
                        >
                            <option value="">All scripts</option>
                            {scripts.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {auditLogStatus === 'loading' && auditLog.length === 0 && (
                        <p className="text-[10px] text-slate-400 italic">Loading…</p>
                    )}

                    {auditLog.length === 0 && auditLogStatus !== 'loading' && (
                        <p className="text-[10px] text-slate-400 italic">No executions recorded yet.</p>
                    )}

                    {/* Execution list */}
                    <div className="space-y-1">
                        {auditLog.map(exec => {
                            const styles = STATUS_STYLES[exec.status] ?? STATUS_STYLES.failure
                            const isOpen = expandedIds.has(exec.id)
                            const duration = exec.started_at && exec.finished_at
                                ? `${Math.round((new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime()) / 1000)}s`
                                : null

                            return (
                                <div
                                    key={exec.id}
                                    className="border border-slate-200 dark:border-slate-700 rounded overflow-hidden"
                                >
                                    <div
                                        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                        onClick={() => toggleExpand(exec.id)}
                                    >
                                        <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", styles.dot)} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                                                    {exec.script_name}
                                                </span>
                                                <span className={cn("text-[9px] rounded px-1 font-medium shrink-0", styles.badge)}>
                                                    {exec.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="text-[9px] text-slate-400 truncate">
                                                {exec.profile_name} · {exec.server_host} · {formatRelative(exec.requested_at)}
                                            </div>
                                        </div>
                                        <ChevronRight className={cn("h-3 w-3 text-slate-400 shrink-0 transition-transform", isOpen && "rotate-90")} />
                                    </div>

                                    {isOpen && (
                                        <div className="px-2 pb-2 bg-slate-50 dark:bg-slate-900 border-t dark:border-slate-700 space-y-1">
                                            <div className="text-[9px] text-slate-500 space-y-0.5 mt-1.5">
                                                <div><span className="font-medium">Triggered by:</span> {exec.triggered_by}</div>
                                                {exec.approved_by && (
                                                    <div><span className="font-medium">Approved by:</span> {exec.approved_by}</div>
                                                )}
                                                {exec.remote_path && (
                                                    <div><span className="font-medium">Remote path:</span> <span className="font-mono">{exec.remote_path}</span></div>
                                                )}
                                                {exec.exit_code !== null && (
                                                    <div><span className="font-medium">Exit code:</span> {exec.exit_code}</div>
                                                )}
                                                {duration && (
                                                    <div><span className="font-medium">Duration:</span> {duration}</div>
                                                )}
                                                {exec.started_at && (
                                                    <div><span className="font-medium">Started:</span> {new Date(exec.started_at).toLocaleString()}</div>
                                                )}
                                            </div>
                                            {exec.log_output && (
                                                <pre className="text-[9px] font-mono bg-slate-900 dark:bg-black text-green-400 rounded p-1.5 max-h-20 overflow-y-auto whitespace-pre-wrap">
                                                    {exec.log_output.slice(-2000)}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Pagination */}
                    {auditLogTotal > LIMIT && (
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs flex-1"
                                disabled={offset === 0 || auditLogStatus === 'loading'}
                                onClick={() => load(Math.max(0, offset - LIMIT))}
                            >
                                ← Newer
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs flex-1"
                                disabled={offset + LIMIT >= auditLogTotal || auditLogStatus === 'loading'}
                                onClick={() => load(offset + LIMIT)}
                            >
                                Older →
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
