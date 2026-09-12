import { useCallback, useEffect, useState } from 'react'
import { Clock, LoaderCircle, Trash2 } from 'lucide-react'
import {
  deleteWorkflowTriggerRuntime,
  listWorkflowTriggersRuntime,
  saveWorkflowTriggerRuntime,
  type WorkflowTriggerRuntime,
} from '@/lib/workflowsRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

function nextRunPreview(cron: string): string | null {
  // Light client-side validation mirroring the backend's 5-field cron rules.
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return null
  return fields.length === 5 ? 'valid' : null
}

/**
 * Manage the cron trigger of a workflow: enable a 5-field cron schedule and
 * the desktop scheduler starts published runs on time (run-once policy for
 * missed ticks).
 */
export function WorkflowTriggerDialog({ open, onClose, workflowId, workflowName }: {
  open: boolean
  onClose: () => void
  workflowId: string
  workflowName: string
}) {
  const [triggers, setTriggers] = useState<WorkflowTriggerRuntime[]>([])
  const [cron, setCron] = useState('0 9 * * 1-5')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const items = await listWorkflowTriggersRuntime(workflowId)
      setTriggers(items)
      const enabled = items.find((item) => item.enabled)
      if (enabled?.config?.cron) setCron(String(enabled.config.cron))
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load workflow triggers'))
    } finally {
      setLoading(false)
    }
  }, [workflowId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!open) return null

  const enabledTrigger = triggers.find((item) => item.enabled)

  const save = async (enabled: boolean) => {
    setSaving(true)
    try {
      await saveWorkflowTriggerRuntime({ workflowId, type: 'cron', cron, enabled })
      toast.success(enabled ? 'Cron trigger saved' : 'Cron trigger disabled')
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save trigger'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (triggerId: string) => {
    setSaving(true)
    try {
      await deleteWorkflowTriggerRuntime(triggerId)
      toast.success('Trigger deleted')
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to delete trigger'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Workflow triggers" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-xl border border-wb-border bg-card shadow-lg">
        <div className="flex items-center gap-2 border-b border-wb-border px-4 py-3">
          <Clock className="h-4 w-4 text-accent-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Schedule</div>
            <div className="truncate text-[11px] text-muted-foreground">{workflowName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">✕</button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Runs the <span className="font-semibold text-foreground">published version</span> on a cron schedule (5 fields: minute hour day month weekday).
            Missed fires happen once at the next scheduler tick, not per tick.
          </p>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cron expression</span>
            <input
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              placeholder="0 9 * * 1-5"
              className="h-9 w-full rounded-md border border-wb-border bg-background px-2.5 font-mono text-xs outline-none focus:border-accent-brand"
            />
          </label>
          <p className="text-[10px] text-muted-foreground">
            {nextRunPreview(cron) ? 'Looks valid — the scheduler computes the next fire time when you save.' : 'Needs exactly 5 fields, e.g. "*/15 * * * *" every 15 minutes.'}
          </p>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-[11px] text-muted-foreground">
              {loading ? 'Loading…' : enabledTrigger
                ? <span className="text-emerald-600 dark:text-emerald-400">Enabled · next {String((enabledTrigger.config as Record<string, unknown>)?.nextRunAt ?? '—')}</span>
                : 'No active trigger'}
            </div>
            <div className="flex items-center gap-1.5">
              {enabledTrigger && (
                <button
                  disabled={saving}
                  onClick={() => void remove(enabledTrigger.id)}
                  className="flex items-center gap-1 rounded-md border border-wb-border px-2.5 py-1.5 text-xs text-destructive hover:bg-muted disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              {enabledTrigger && (
                <button
                  disabled={saving}
                  onClick={() => void save(false)}
                  className="rounded-md border border-wb-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              <button
                disabled={saving}
                onClick={() => void save(true)}
                className="flex items-center gap-1.5 rounded-md bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                {enabledTrigger ? 'Update schedule' : 'Enable schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
