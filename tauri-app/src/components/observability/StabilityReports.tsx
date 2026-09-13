import { useCallback, useEffect, useState } from 'react'
import { Flame, LoaderCircle } from 'lucide-react'
import { invokeTauri } from '@/lib/tauriInvoke'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type ReportKind = 'script' | 'workflow' | 'api'

type EntityOption = { id: string; name: string }

type EntityReport = {
  kind: string
  entityId: string
  name: string
  windowRuns: number
  succeeded: number
  failed: number
  successRate: number
  p50DurationMs: number | null
  p95DurationMs: number | null
  currentFailureStreak: number
  flakeScore: number
  flaky: boolean
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

const KINDS: Array<{ value: ReportKind; label: string }> = [
  { value: 'workflow', label: 'Workflows' },
  { value: 'script', label: 'Scripts' },
  { value: 'api', label: 'API collections' },
]

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-wb-border bg-card px-3 py-2.5">
      <div className={cn(
        'text-lg font-semibold leading-tight',
        tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'bad' && 'text-red-500',
        tone === 'warn' && 'text-amber-600 dark:text-amber-400',
      )}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

/**
 * Stability reports per script/workflow/API collection: success rate,
 * latency percentiles, failure streaks, and a flake badge (flips across the
 * last N runs).
 */
export function StabilityReports() {
  const [kind, setKind] = useState<ReportKind>('workflow')
  const [entities, setEntities] = useState<EntityOption[]>([])
  const [entityId, setEntityId] = useState('')
  const [report, setReport] = useState<EntityReport | null>(null)
  const [loading, setLoading] = useState(false)

  const loadEntities = useCallback(async (nextKind: ReportKind) => {
    setLoading(true)
    try {
      const list = isTauri()
        ? await invokeTauri<EntityOption[]>('list_report_entities', { kind: nextKind })
        : (window.scriptManagerDesktop?.runtime?.listReportEntities
          ? (await window.scriptManagerDesktop.runtime.listReportEntities(nextKind)) as EntityOption[]
          : [])
      setEntities(list)
      setEntityId(list[0]?.id ?? '')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load entities'))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReport = useCallback(async (nextKind: ReportKind, id: string) => {
    if (!id) {
      setReport(null)
      return
    }
    setLoading(true)
    try {
      if (isTauri()) {
        setReport(await invokeTauri<EntityReport>('get_entity_report', { kind: nextKind, entityId: id, window: 30 }))
      } else if (window.scriptManagerDesktop?.runtime?.getEntityReport) {
        setReport(await window.scriptManagerDesktop.runtime.getEntityReport({ kind: nextKind, entityId: id, window: 30 }) as EntityReport)
      }
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load report'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEntities(kind)
  }, [kind, loadEntities])

  useEffect(() => {
    if (entityId) void loadReport(kind, entityId)
  }, [entityId, kind, loadReport])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        {KINDS.map((option) => (
          <button
            key={option.value}
            onClick={() => setKind(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-[11px] transition-colors',
              kind === option.value
                ? 'border-accent-brand bg-accent-brand/10 text-accent-brand'
                : 'border-wb-border text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        ))}
        {loading && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {entities.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Nothing to report on yet.</p>
      ) : (
        <select
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          className="h-8 w-full rounded-md border border-wb-border bg-background px-2 text-xs outline-none focus:border-accent-brand"
          aria-label="Entity"
        >
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
      )}

      {report && report.windowRuns > 0 && (
        <div className="space-y-3 rounded-lg border border-wb-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{report.name}</span>
            {report.flaky && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <Flame className="h-3 w-3" /> Flaky ({Math.round(report.flakeScore * 100)}% flips)
              </span>
            )}
            {report.currentFailureStreak > 1 && (
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                {report.currentFailureStreak} failing in a row
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">last {report.windowRuns} runs</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-6">
            <Stat label="Success rate" value={`${report.successRate}%`} tone={report.successRate >= 90 ? 'good' : report.successRate >= 60 ? 'warn' : 'bad'} />
            <Stat label="Succeeded" value={String(report.succeeded)} tone="good" />
            <Stat label="Failed" value={String(report.failed)} tone={report.failed > 0 ? 'bad' : undefined} />
            <Stat label="p50 duration" value={report.p50DurationMs !== null ? `${(report.p50DurationMs / 1000).toFixed(1)}s` : '—'} />
            <Stat label="p95 duration" value={report.p95DurationMs !== null ? `${(report.p95DurationMs / 1000).toFixed(1)}s` : '—'} />
            <Stat label="Fail streak" value={String(report.currentFailureStreak)} tone={report.currentFailureStreak > 2 ? 'bad' : undefined} />
          </div>
        </div>
      )}

      {report && report.windowRuns === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">No runs in the window for {report.name}.</p>
      )}
    </div>
  )
}
