import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listApiAssertionsRuntime, saveApiAssertionsRuntime, type ApiAssertionRuntime } from '@/lib/apiRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type CheckRow = {
  name: string
  kind: ApiAssertionRuntime['kind']
  target: string
  operator: string
  expected: string
  enabled: boolean
}

const KINDS: Array<{ value: CheckRow['kind']; label: string }> = [
  { value: 'status', label: 'Status' },
  { value: 'latency_ms', label: 'Latency (ms)' },
  { value: 'header', label: 'Header' },
  { value: 'body_path', label: 'Body path' },
]

const OPERATORS: Record<CheckRow['kind'], string[]> = {
  status: ['equals'],
  latency_ms: ['equals', 'lt', 'gt'],
  header: ['equals', 'contains', 'matches_regex'],
  body_path: ['equals', 'not_equals', 'contains', 'matches_regex', 'gt', 'lt', 'has_key', 'type_is'],
}

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  matches_regex: 'matches regex',
  gt: '>',
  lt: '<',
  has_key: 'has key',
  type_is: 'type is',
}

function emptyRow(): CheckRow {
  return { name: '', kind: 'status', target: '', operator: 'equals', expected: '', enabled: true }
}

/**
 * Declarative checks ("Checks" tab): no-code assertions evaluated on every
 * send in Rust alongside JS test scripts, sharing the same pass/fail results
 * surface in the response viewer and collection runs.
 */
export function ApiChecksPanel({ requestId }: { requestId: string | undefined }) {
  const [rows, setRows] = useState<CheckRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const saved = await listApiAssertionsRuntime(id)
      setRows(saved.map((row) => ({
        name: row.name ?? '',
        kind: row.kind,
        target: row.target ?? '',
        operator: row.operator,
        expected: row.expected ?? '',
        enabled: row.enabled,
      })))
      setDirty(false)
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load checks'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (requestId) void load(requestId)
    else setRows([])
  }, [requestId, load])

  const update = (index: number, patch: Partial<CheckRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setDirty(true)
  }

  const save = async () => {
    if (!requestId) return
    setSaving(true)
    try {
      const saved = await saveApiAssertionsRuntime({
        requestId,
        assertions: rows.map((row) => ({
          name: row.name || null,
          kind: row.kind,
          target: row.target || null,
          operator: row.operator,
          expected: row.expected,
          enabled: row.enabled,
        })),
      })
      setRows(saved.map((row) => ({
        name: row.name ?? '',
        kind: row.kind,
        target: row.target ?? '',
        operator: row.operator,
        expected: row.expected ?? '',
        enabled: row.enabled,
      })))
      setDirty(false)
      toast.success('Checks saved — they run on every send')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save checks'))
    } finally {
      setSaving(false)
    }
  }

  if (!requestId) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <p className="text-xs text-muted-foreground">
          Save the request to attach declarative checks. They run on every send and gate collection runs.
        </p>
      </div>
    )
  }

  const cellClass = 'h-8 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 text-xs outline-none focus:border-blue-400'

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Checks</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            No-code assertions evaluated with JS tests on every send.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" className="gap-1.5 h-8" onClick={() => { setRows((current) => [...current, emptyRow()]); setDirty(true) }}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
          <Button className="gap-1.5 h-8" disabled={!dirty || saving || loading} onClick={() => void save()}>
            {saving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-3.5 w-3.5" />}
            {dirty ? 'Save checks' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {rows.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            No checks yet. Add one — e.g. status equals 200.
          </p>
        )}
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className={cn(
              'grid grid-cols-[auto_minmax(0,7rem)_minmax(0,1fr)_minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-800 p-1.5',
              !row.enabled && 'opacity-50'
            )}>
              <button
                aria-label={row.enabled ? 'Disable check' : 'Enable check'}
                onClick={() => update(index, { enabled: !row.enabled })}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded border',
                  row.enabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-slate-300 dark:border-slate-700 text-transparent'
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <select
                aria-label="Check kind"
                value={row.kind}
                onChange={(event) => update(index, { kind: event.target.value as CheckRow['kind'], operator: OPERATORS[event.target.value as CheckRow['kind']][0] })}
                className={cellClass}
              >
                {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
              {row.kind === 'status' || row.kind === 'latency_ms' ? (
                <span className="text-[11px] text-slate-400 px-2">response</span>
              ) : (
                <input
                  aria-label={row.kind === 'header' ? 'Header name' : 'Body path'}
                  value={row.target}
                  onChange={(event) => update(index, { target: event.target.value })}
                  placeholder={row.kind === 'header' ? 'content-type' : 'user.name'}
                  className={cn(cellClass, 'font-mono')}
                />
              )}
              <select
                aria-label="Operator"
                value={row.operator}
                onChange={(event) => update(index, { operator: event.target.value })}
                className={cellClass}
              >
                {OPERATORS[row.kind].map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
              </select>
              {row.operator === 'has_key' ? (
                <span className="text-[11px] text-slate-400 px-2">—</span>
              ) : (
                <input
                  aria-label="Expected value"
                  value={row.expected}
                  onChange={(event) => update(index, { expected: event.target.value })}
                  placeholder={row.operator === 'type_is' ? 'string | number | boolean | array | object | null' : row.operator === 'matches_regex' ? 'pattern' : 'expected'}
                  className={cn(cellClass, 'font-mono')}
                />
              )}
              <button
                aria-label="Remove check"
                onClick={() => { setRows((current) => current.filter((_, i) => i !== index)); setDirty(true) }}
                className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
