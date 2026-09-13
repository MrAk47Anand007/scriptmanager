import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Copy, LoaderCircle, RotateCcw, Trash2, Webhook } from 'lucide-react'
import {
  deleteWorkflowTriggerRuntime,
  listWorkflowTriggersRuntime,
  rotateWorkflowWebhookRuntime,
  saveWorkflowTriggerRuntime,
  webhookListenerStatusRuntime,
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
 * Manage the triggers of a workflow: a cron schedule and/or a webhook URL
 * (with HMAC secret) served by the desktop's local listener.
 */
export function WorkflowTriggerDialog({ open, onClose, workflowId, workflowName }: {
  open: boolean
  onClose: () => void
  workflowId: string
  workflowName: string
}) {
  const [triggers, setTriggers] = useState<WorkflowTriggerRuntime[]>([])
  const [cron, setCron] = useState('0 9 * * 1-5')
  const [webhook, setWebhook] = useState<{ token: string; secret: string } | null>(null)
  const [listenerPort, setListenerPort] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [items, port] = await Promise.all([
        listWorkflowTriggersRuntime(workflowId),
        webhookListenerStatusRuntime().catch(() => null),
      ])
      setTriggers(items)
      setListenerPort(port)
      const enabled = items.find((item) => item.enabled && item.triggerType === 'cron')
      if (enabled?.config?.cron) setCron(String(enabled.config.cron))
      const hook = items.find((item) => item.triggerType === 'webhook')
      if (hook?.config?.token) {
        setWebhook({ token: String(hook.config.token), secret: String(hook.config.secret ?? '') })
      }
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

  const enabledTrigger = triggers.find((item) => item.enabled && item.triggerType === 'cron')

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

  const removeCron = async (triggerId: string) => {
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

  const enableWebhook = async () => {
    setSaving(true)
    try {
      const info = await rotateWorkflowWebhookRuntime(workflowId)
      setWebhook({ token: info.token, secret: info.secret })
      const port = await webhookListenerStatusRuntime().catch(() => null)
      setListenerPort(port)
      toast.success('Webhook enabled')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to enable webhook'))
    } finally {
      setSaving(false)
    }
  }

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const webhookUrl = webhook ? `http://127.0.0.1:${listenerPort ?? 8787}/webhook/${webhook.token}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Workflow triggers" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-xl border border-wb-border bg-card shadow-lg">
        <div className="flex items-center gap-2 border-b border-wb-border px-4 py-3">
          <Clock className="h-4 w-4 text-accent-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Triggers</div>
            <div className="truncate text-[11px] text-muted-foreground">{workflowName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">✕</button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cron schedule</h3>
            <input
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              placeholder="0 9 * * 1-5"
              className="h-9 w-full rounded-md border border-wb-border bg-background px-2.5 font-mono text-xs outline-none focus:border-accent-brand"
            />
            <p className="text-[10px] text-muted-foreground">
              5 fields (minute hour day month weekday). Runs the published version; missed fires happen once at the next tick.
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {loading ? 'Loading…' : enabledTrigger
                  ? <span className="text-emerald-600 dark:text-emerald-400">Enabled · next {String((enabledTrigger.config as Record<string, unknown>)?.nextRunAt ?? '—')}</span>
                  : 'No active schedule'}
              </div>
              <div className="flex items-center gap-1.5">
                {enabledTrigger && (
                  <button
                    disabled={saving}
                    onClick={() => void removeCron(enabledTrigger.id)}
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
            {cron && nextRunPreview(cron) === null && (
              <p className="text-[10px] text-destructive">Needs exactly 5 fields, e.g. "*/15 * * * *".</p>
            )}
          </section>

          <section className="space-y-2 border-t border-wb-border pt-3">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Webhook className="h-3 w-3" /> Webhook
            </h3>
            {webhook ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 font-mono text-[10px]">{webhookUrl}</code>
                  <button aria-label="Copy webhook URL" onClick={() => webhookUrl && copy('url', webhookUrl)} className="shrink-0 rounded p-1 text-slate-400 hover:text-foreground">
                    {copied === 'url' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 font-mono text-[10px]">secret: {webhook.secret}</code>
                  <button aria-label="Copy secret" onClick={() => copy('secret', webhook.secret)} className="shrink-0 rounded p-1 text-slate-400 hover:text-foreground">
                    {copied === 'secret' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    aria-label="Rotate token and secret"
                    disabled={saving}
                    onClick={() => void enableWebhook()}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-foreground"
                    title="Rotate token and secret"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  POST JSON to trigger a run. Sign the body with HMAC-SHA256 and a recent RFC3339 timestamp:
                  headers <code className="font-mono">X-ScriptManager-Signature: sha256=&lt;hex&gt;</code> and <code className="font-mono">X-ScriptManager-Timestamp</code>.
                  Send an <code className="font-mono">Idempotency-Key</code> header to dedupe retries.{' '}
                  <span className={listenerPort ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                    Listener: {listenerPort ? `running on :${listenerPort}` : 'not running (desktop app closed)'}
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Trigger this workflow from CI, GitHub, or any HTTP client via the local listener.
                </p>
                <button
                  disabled={saving}
                  onClick={() => void enableWebhook()}
                  className="flex items-center gap-1.5 rounded-md bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  Enable webhook
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
