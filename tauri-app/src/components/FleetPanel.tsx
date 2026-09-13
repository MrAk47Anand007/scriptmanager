import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronUp, LoaderCircle, Rocket, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  approveFleetRunRuntime,
  listFleetRunsRuntime,
  startFleetRunRuntime,
  type FleetRunRuntime,
} from '@/lib/fleetRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Profile = { id: string; name: string; host: string; username: string }

const STATUS_TONE: Record<string, string> = {
  succeeded: 'text-emerald-600 dark:text-emerald-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-500',
  partial: 'text-amber-600 dark:text-amber-400',
  running: 'text-blue-500',
  pending: 'text-muted-foreground',
  pending_approval: 'text-amber-600 dark:text-amber-400',
}

/**
 * Fleet mode: run one command on many SSH server profiles concurrently.
 * One human approval covers the batch; per-target status and output stream
 * into the run card.
 */
export function FleetPanel({ profiles }: { profiles: Profile[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [command, setCommand] = useState('uptime')
  const [note, setNote] = useState('')
  const [runs, setRuns] = useState<FleetRunRuntime[]>([])
  const [busy, setBusy] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRuns(await listFleetRunsRuntime(10))
    } catch {
      // history is best-effort
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5_000)
    return () => window.clearInterval(timer)
  }, [load])

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const start = async () => {
    setBusy(true)
    try {
      const run = await startFleetRunRuntime({
        profileIds: [...selected],
        command,
        note: note.trim() || undefined,
      })
      toast.success(`Fleet run created — ${run.totalTargets} targets awaiting approval`)
      await load()
      setExpandedRun(run.id)
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to start fleet run'))
    } finally {
      setBusy(false)
    }
  }

  const approve = async (id: string) => {
    setBusy(true)
    try {
      const run = await approveFleetRunRuntime(id)
      const label = run.status === 'done'
        ? `All ${run.totalTargets} targets succeeded`
        : `${run.succeededTargets}/${run.totalTargets} succeeded`
      if (run.status === 'done') toast.success(label)
      else toast.error(`Fleet run finished: ${label}`)
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Fleet dispatch failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-wb-border bg-card p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-accent-brand" />
          <span className="text-xs font-semibold text-foreground">Fleet execution</span>
          <span className="text-[11px] text-muted-foreground">
            {selected.size > 0 ? `${selected.size} target${selected.size === 1 ? '' : 's'} selected` : 'run one command on many servers'}
          </span>
        </div>

        {profiles.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Add server profiles first — then select them here.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((profile) => {
              const active = selected.has(profile.id)
              return (
                <button
                  key={profile.id}
                  onClick={() => toggle(profile.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                    active
                      ? 'border-accent-brand bg-accent-brand/10 text-accent-brand'
                      : 'border-wb-border text-muted-foreground hover:text-foreground'
                  )}
                  title={`${profile.username}@${profile.host}`}
                >
                  {active && <Check className="mr-1 inline h-3 w-3" />}
                  {profile.name}
                </button>
              )
            })}
            <button
              onClick={() => setSelected(new Set(profiles.map((profile) => profile.id)))}
              className="rounded-full px-2 py-1 text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              select all
            </button>
          </div>
        )}

        <div className="flex gap-1.5">
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="uptime"
            spellCheck={false}
            className="h-8 flex-1 rounded-md border border-wb-border bg-background px-2.5 font-mono text-xs outline-none focus:border-accent-brand"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="note (optional)"
            className="h-8 w-40 rounded-md border border-wb-border bg-background px-2.5 text-xs outline-none focus:border-accent-brand"
          />
          <Button className="h-8 gap-1.5 text-xs" disabled={busy || selected.size === 0 || !command.trim()} onClick={() => void start()}>
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Run on {selected.size || ''} server{selected.size === 1 ? '' : 's'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {runs.map((run) => {
          const expanded = expandedRun === run.id
          return (
            <div key={run.id} className="rounded-lg border border-wb-border bg-card">
              <button
                onClick={() => setExpandedRun(expanded ? null : run.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{run.command}</code>
                <span className={cn('shrink-0 text-[10px] font-medium', STATUS_TONE[run.status] ?? '')}>
                  {run.status.replace('_', ' ')}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {run.succeededTargets}/{run.totalTargets}
                </span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
              </button>
              {expanded && (
                <div className="border-t border-wb-border px-3 py-2 space-y-2">
                  {run.status === 'pending_approval' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-600 dark:text-amber-400">
                        Awaiting approval — one approval dispatches all {run.totalTargets} targets.
                      </span>
                      <Button className="ml-auto h-7 gap-1 text-[11px]" disabled={busy} onClick={() => void approve(run.id)}>
                        <Check className="h-3 w-3" /> Approve & dispatch
                      </Button>
                      <Button variant="outline" className="h-7 text-[11px]" disabled>
                        <X className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  )}
                  <div className="space-y-1">
                    {run.targets.map((target) => (
                      <details key={target.id} className="rounded border border-wb-border/60">
                        <summary className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[11px]">
                          <span className={cn('h-1.5 w-1.5 rounded-full', target.status === 'succeeded' ? 'bg-emerald-500' : target.status === 'failed' ? 'bg-red-500' : target.status === 'running' ? 'bg-blue-500' : 'bg-muted-foreground')} />
                          <span className="font-medium">{target.profileName}</span>
                          <span className={cn('ml-auto text-[10px]', STATUS_TONE[target.status] ?? 'text-muted-foreground')}>
                            {target.status}
                            {target.exitCode !== null && target.exitCode !== undefined ? ` (exit ${target.exitCode})` : ''}
                          </span>
                        </summary>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-t border-wb-border/60 bg-background/50 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                          {target.output?.trim() || '(no output)'}
                        </pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {runs.length === 0 && (
          <p className="py-3 text-center text-[11px] text-muted-foreground">No fleet runs yet.</p>
        )}
      </div>
    </div>
  )
}
