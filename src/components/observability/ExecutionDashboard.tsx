'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, RotateCw, Timer } from 'lucide-react'
import type { ExecutionDashboard as Dashboard, ExecutionKind, ExecutionRunSummary, ExecutionStatus } from '@/lib/observability/types'
import { cancelObservabilityRunRuntime, getObservabilityDashboardRuntime, getObservabilityRunDetailRuntime, readObservabilityLogRuntime, retryObservabilityRunRuntime } from '@/lib/observabilityRuntimeClient'
import { isExecutionRunActive } from '@/lib/observability/runStatus'
import { RunDetail } from './RunDetail'

const empty: Dashboard = { metrics: { active: 0, succeeded: 0, failed: 0, timedOut: 0, retried: 0, averageDurationMs: 0 }, activeRuns: [], recentRuns: [], failureTrend: [], scheduleHealth: { healthy: 0, disabled: 0, failing: 0 } }
const REFRESH_INTERVAL_MS = 5_000

export function ExecutionDashboard() {
  const [data, setData] = useState(empty), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [kind, setKind] = useState<ExecutionKind | ''>(''), [status, setStatus] = useState<ExecutionStatus | ''>(''), [selected, setSelected] = useState<ExecutionRunSummary | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null), [busy, setBusy] = useState(false)
  const dashboardInFlight = useRef(false)
  const load = useCallback(async (options?: { silent?: boolean }) => { setLoading(!options?.silent); setError(''); try { setData(await getObservabilityDashboardRuntime({ kind: kind || undefined, status: status || undefined })) } catch (value) { setError(value instanceof Error ? value.message : 'Dashboard could not be loaded') } finally { setLoading(false) } }, [kind, status])
  const refreshDashboard = useCallback(async (options?: { silent?: boolean }) => { if (dashboardInFlight.current) return; dashboardInFlight.current = true; try { await load(options) } finally { dashboardInFlight.current = false } }, [load])
  useEffect(() => { void refreshDashboard() }, [refreshDashboard])
  useEffect(() => { const timer = window.setInterval(() => { void refreshDashboard({ silent: true }) }, REFRESH_INTERVAL_MS); return () => window.clearInterval(timer) }, [refreshDashboard])
  const detailStatus = typeof detail?.status === 'string' ? detail.status : selected?.status
  useEffect(() => {
    let current = true
    if (!selected) { setDetail(null); return () => { current = false } }
    void getObservabilityRunDetailRuntime(selected.kind, selected.id).then(value => {
      if (current) setDetail(value)
    }).catch(value => {
      if (current) setError(value instanceof Error ? value.message : 'Run detail could not be loaded')
    })
    return () => { current = false }
  }, [selected])
  useEffect(() => {
    let current = true
    let inFlight = false
    if (!selected || !isExecutionRunActive(detailStatus)) return () => { current = false }
    const refreshDetail = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const value = await getObservabilityRunDetailRuntime(selected.kind, selected.id)
        if (current) setDetail(value)
      } catch (value) {
        if (current) setError(value instanceof Error ? value.message : 'Run detail could not be loaded')
      } finally {
        inFlight = false
      }
    }
    const timer = window.setInterval(() => { void refreshDetail() }, REFRESH_INTERVAL_MS)
    return () => { current = false; window.clearInterval(timer) }
  }, [detailStatus, selected])
  const action = async (name: 'cancel' | 'retry') => { if (!selected) return; setBusy(true); try { if (name === 'cancel') await cancelObservabilityRunRuntime(selected.kind, selected.id); else await retryObservabilityRunRuntime(selected.kind, selected.id); await refreshDashboard(); setSelected(null) } catch (value) { setError(value instanceof Error ? value.message : 'Action failed') } finally { setBusy(false) } }
  const downloadLog = async () => { if (!selected) return; try { const content = await readObservabilityLogRuntime(selected.kind, selected.id); const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selected.kind}-${selected.id}-redacted.log`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0) } catch (value) { setError(value instanceof Error ? value.message : 'Log could not be loaded') } }
  const cards = [[Activity, 'Active', data.metrics.active], [CheckCircle2, 'Succeeded', data.metrics.succeeded], [AlertTriangle, 'Failed', data.metrics.failed], [Timer, 'Timed out', data.metrics.timedOut], [RotateCw, 'Retries', data.metrics.retried], [Clock3, 'Avg duration', `${data.metrics.averageDurationMs}ms`]] as const
  return <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(320px,34%)] bg-background"><div className="overflow-y-auto p-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.22em] text-accent-brand">Operations</p><h1 className="mt-1 text-2xl font-semibold">Execution observability</h1><p className="mt-1 text-sm text-muted-foreground">Every runtime, one causal view.</p></div><div className="flex gap-2"><select aria-label="Execution type" value={kind} onChange={event => setKind(event.target.value as ExecutionKind | '')} className="rounded border border-wb-border bg-background px-3 py-2 text-sm"><option value="">All types</option><option value="workflow">Workflow</option><option value="script">Script</option><option value="api">API</option><option value="remote">Remote</option></select><select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as ExecutionStatus | '')} className="rounded border border-wb-border bg-background px-3 py-2 text-sm"><option value="">All statuses</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="timed_out">Timed out</option></select><button onClick={() => void refreshDashboard()} className="rounded border border-wb-border px-3" aria-label="Refresh"><RotateCw className="h-4 w-4" /></button></div></header>{error && <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}<div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{cards.map(([Icon, label, value]) => <div key={label} className="rounded-lg border border-wb-border bg-wb-sidepanel p-3"><Icon className="h-4 w-4 text-accent-brand" /><p className="mt-3 text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div><div className="mt-6 grid gap-4 lg:grid-cols-3"><section className="rounded-lg border border-wb-border p-4 lg:col-span-2"><div className="flex justify-between"><h2 className="font-medium">Recent runs</h2>{loading && <span className="text-xs text-muted-foreground">Refreshing…</span>}</div><div className="mt-3 divide-y divide-wb-border">{data.recentRuns.length ? data.recentRuns.map(run => <button key={`${run.kind}:${run.id}`} onClick={() => setSelected(run)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 py-3 text-left text-sm hover:bg-muted/30"><div><p className="font-medium">{run.name}</p><p className="text-xs text-muted-foreground">{run.kind} · {run.trigger} · {run.correlationId ?? run.id}</p></div><span className="rounded-full border border-wb-border px-2 py-1 text-xs">{run.status}</span><span className="w-20 text-right text-xs text-muted-foreground">{run.durationMs === undefined ? 'active' : `${run.durationMs}ms`}</span></button>) : <p className="py-10 text-center text-sm text-muted-foreground">No executions match these filters.</p>}</div></section><section className="rounded-lg border border-wb-border p-4"><h2 className="font-medium">Schedule health</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span>Healthy</span><b>{data.scheduleHealth.healthy}</b></div><div className="flex justify-between"><span>Failing</span><b>{data.scheduleHealth.failing}</b></div><div className="flex justify-between"><span>Disabled</span><b>{data.scheduleHealth.disabled}</b></div></div><h2 className="mt-8 font-medium">Failure trend</h2><div className="mt-3 flex h-28 items-end gap-1">{data.failureTrend.length ? data.failureTrend.map(point => <div key={point.date} title={`${point.date}: ${point.count}`} className="min-w-2 flex-1 rounded-t bg-red-500/70" style={{ height: `${Math.max(10, Math.min(100, point.count * 18))}%` }} />) : <p className="self-center text-sm text-muted-foreground">No failures in range.</p>}</div></section></div></div>{selected ? <RunDetail run={selected} detail={detail} busy={busy} onAction={action} onDownload={downloadLog} /> : <aside className="flex h-full items-center justify-center border-l border-wb-border bg-wb-sidepanel p-8 text-center text-sm text-muted-foreground">Select a run to inspect its redacted timeline and node provenance.</aside>}</div>
}
