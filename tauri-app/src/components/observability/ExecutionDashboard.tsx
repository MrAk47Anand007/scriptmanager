

import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Clock3, RotateCw, Timer } from 'lucide-react'
import type { ExecutionDashboard as Dashboard, ExecutionKind, ExecutionRunSummary, ExecutionStatus } from '@/lib/observability/types'
import { cancelObservabilityRunRuntime, getObservabilityDashboardRuntime, getObservabilityRunDetailRuntime, readObservabilityLogRuntime, retryObservabilityRunRuntime } from '@/lib/observabilityRuntimeClient'
import { isExecutionRunActive } from '@/lib/observability/runStatus'
import { formatDurationMs } from '@/lib/observability/formatDuration'
import { RunDetail } from './RunDetail'

const empty: Dashboard = { metrics: { active: 0, succeeded: 0, failed: 0, timedOut: 0, retried: 0, averageDurationMs: 0 }, activeRuns: [], recentRuns: [], failureTrend: [], scheduleHealth: { healthy: 0, disabled: 0, failing: 0 } }
const REFRESH_INTERVAL_MS = 5_000

const STATUS_PILL: Record<string, string> = {
  succeeded: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'border-red-500/30 bg-red-500/10 text-red-500',
  timed_out: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  running: 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400',
  queued: 'border-wb-border bg-muted/40 text-muted-foreground',
  cancelled: 'border-wb-border bg-muted/40 text-muted-foreground',
  waiting: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

/**
 * Cross-domain execution dashboard (workflow / script / api / remote runs).
 * Styled to the workbench's compact design language: explicit text sizes on
 * every element (this subtree must not rely on browser-default heading
 * sizes), small-caps section headers, and humanized durations.
 */
export function ExecutionDashboard() {
  const [data, setData] = useState(empty), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [kind, setKind] = useState<ExecutionKind | ''>(''), [status, setStatus] = useState<ExecutionStatus | ''>(''), [selected, setSelected] = useState<ExecutionRunSummary | null>(null)
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null), [busy, setBusy] = useState(false)
  const dashboardInFlight = useRef(false)
  const selectRun = (run: ExecutionRunSummary) => { setSelected(run); setDetail(null) }
  const load = useCallback(async (options?: { silent?: boolean }) => { setLoading(!options?.silent); setError(''); try { setData(await getObservabilityDashboardRuntime({ kind: kind || undefined, status: status || undefined })) } catch (value) { setError(value instanceof Error ? value.message : 'Dashboard could not be loaded') } finally { setLoading(false) } }, [kind, status])
  const refreshDashboard = useCallback(async (options?: { silent?: boolean }) => { if (dashboardInFlight.current) return; dashboardInFlight.current = true; try { await load(options) } finally { dashboardInFlight.current = false } }, [load])
  useEffect(() => { void refreshDashboard() }, [refreshDashboard])
  useEffect(() => { const timer = window.setInterval(() => { void refreshDashboard({ silent: true }) }, REFRESH_INTERVAL_MS); return () => window.clearInterval(timer) }, [refreshDashboard])
  const detailStatus = typeof detail?.status === 'string' ? detail.status : selected?.status
  useEffect(() => {
    let current = true
    setDetail(null)
    if (!selected) return () => { current = false }
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
  const cards = [
    [Activity, 'Active', String(data.metrics.active), 'default'],
    [CheckCircle2, 'Succeeded', String(data.metrics.succeeded), 'ok'],
    [AlertTriangle, 'Failed', String(data.metrics.failed), 'bad'],
    [Timer, 'Timed out', String(data.metrics.timedOut), 'warn'],
    [RotateCw, 'Retries', String(data.metrics.retried), 'default'],
    [Clock3, 'Avg duration', formatDurationMs(data.metrics.averageDurationMs), 'default'],
  ] as const
  const iconTone: Record<string, string> = {
    ok: 'bg-emerald-500/10 text-emerald-500',
    bad: 'bg-red-500/10 text-red-500',
    warn: 'bg-amber-500/10 text-amber-500',
    default: 'bg-accent text-muted-foreground',
  }

  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(300px,32%)] bg-background">
      <div className="overflow-y-auto p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Execution observability</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Every runtime, one causal view.</p>
          </div>
          <div className="flex gap-1.5">
            <select aria-label="Execution type" value={kind} onChange={event => setKind(event.target.value as ExecutionKind | '')} className="h-8 rounded-md border border-wb-border bg-background px-2 text-xs">
              <option value="">All types</option>
              <option value="workflow">Workflow</option>
              <option value="script">Script</option>
              <option value="api">API</option>
              <option value="remote">Remote</option>
            </select>
            <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as ExecutionStatus | '')} className="h-8 rounded-md border border-wb-border bg-background px-2 text-xs">
              <option value="">All statuses</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="timed_out">Timed out</option>
            </select>
            <button onClick={() => void refreshDashboard()} className="flex h-8 items-center rounded-md border border-wb-border px-2 hover:bg-muted" aria-label="Refresh"><RotateCw className="h-3.5 w-3.5" /></button>
          </div>
        </header>

        {error && <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-500">{error}</div>}

        <div className="mt-4 grid grid-cols-3 gap-2.5 xl:grid-cols-6">
          {cards.map(([Icon, label, value, tone]) => (
            <div key={label} className="wb-transition flex items-center gap-2.5 rounded-lg border border-wb-border bg-card px-3 py-2.5">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconTone[tone]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight text-foreground">{value}</div>
                <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <section className="rounded-lg border border-wb-border bg-card p-3.5 lg:col-span-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent runs</h3>
              {loading && <span className="text-[10px] text-muted-foreground">Refreshing…</span>}
            </div>
            <div className="mt-2 divide-y divide-wb-border/60">
              {data.recentRuns.length
                ? data.recentRuns.map(run => (
                  <button key={`${run.kind}:${run.id}`} onClick={() => selectRun(run)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 py-2 text-left hover:bg-muted/30">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{run.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{run.kind} · {run.trigger} · {run.correlationId ?? run.id}</p>
                    </div>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_PILL[run.status] ?? STATUS_PILL.queued}`}>{run.status.replace('_', ' ')}</span>
                    <span className="w-14 text-right text-[10px] text-muted-foreground">{run.durationMs === undefined ? 'active' : formatDurationMs(run.durationMs)}</span>
                  </button>
                ))
                : <p className="py-8 text-center text-xs text-muted-foreground">No executions match these filters.</p>}
            </div>
          </section>

          <section className="rounded-lg border border-wb-border bg-card p-3.5 lg:col-span-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Schedule health</h3>
            <div className="mt-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Healthy</span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{data.scheduleHealth.healthy}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Failing</span><span className="font-semibold text-red-500">{data.scheduleHealth.failing}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Disabled</span><span className="font-semibold text-foreground">{data.scheduleHealth.disabled}</span></div>
            </div>
            <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Failure trend</h3>
            <div className="mt-2 flex h-20 items-end gap-1">
              {data.failureTrend.length
                ? data.failureTrend.map(point => <div key={point.date} title={`${point.date}: ${point.count}`} className="min-w-1.5 flex-1 rounded-t bg-red-500/70" style={{ height: `${Math.max(8, Math.min(100, point.count * 18))}%` }} />)
                : <p className="self-center text-xs text-muted-foreground">No failures in range.</p>}
            </div>
          </section>
        </div>
      </div>
      {selected
        ? <RunDetail run={selected} detail={detail} busy={busy} onAction={action} onDownload={downloadLog} />
        : <aside className="flex h-full items-center justify-center border-l border-wb-border bg-wb-sidepanel p-8 text-center text-xs text-muted-foreground">Select a run to inspect its redacted timeline and node provenance.</aside>}
    </div>
  )
}
