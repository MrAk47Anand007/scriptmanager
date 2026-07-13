'use client'

import { Download, RefreshCw, Square } from 'lucide-react'
import type { ExecutionRunSummary } from '@/lib/observability/types'

export function RunDetail({ run, detail, busy, onAction }: { run: ExecutionRunSummary; detail: Record<string, unknown> | null; busy: boolean; onAction: (action: 'cancel' | 'retry') => void }) {
  const nodes = Array.isArray(detail?.nodeRuns) ? detail.nodeRuns as Array<Record<string, unknown>> : []
  const events = Array.isArray(detail?.events) ? detail.events as Array<Record<string, unknown>> : []
  return (
    <aside className="h-full overflow-y-auto border-l border-wb-border bg-wb-sidepanel p-5">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Run detail</p><h2 className="mt-1 font-semibold">{run.name}</h2><p className="mt-1 font-mono text-xs text-muted-foreground">{run.correlationId ?? run.id}</p></div><span className="rounded-full border border-wb-border px-2 py-1 text-xs">{run.status}</span></div>
      <div className="mt-4 flex gap-2">
        {['queued', 'running', 'waiting'].includes(run.status) && <button disabled={busy || run.kind !== 'workflow'} onClick={() => onAction('cancel')} className="flex items-center gap-1 rounded border border-wb-border px-2 py-1 text-xs disabled:opacity-40"><Square className="h-3 w-3" /> Cancel</button>}
        {['failed', 'interrupted', 'timed_out'].includes(run.status) && <button disabled={busy || run.kind !== 'workflow'} onClick={() => onAction('retry')} className="flex items-center gap-1 rounded bg-accent-brand px-2 py-1 text-xs text-white disabled:opacity-40"><RefreshCw className="h-3 w-3" /> Retry failed node</button>}
        <a className="flex items-center gap-1 rounded border border-wb-border px-2 py-1 text-xs" href={`/api/observability/runs/${run.kind}/${run.id}/log`}><Download className="h-3 w-3" /> Log</a>
      </div>
      <section className="mt-6"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node attempts</h3><div className="mt-2 space-y-2">{nodes.length ? nodes.map(node => <div key={String(node.id)} className="rounded border border-wb-border bg-background p-3 text-xs"><div className="flex justify-between"><span className="font-medium">{String(node.nodeId)}</span><span>{String(node.status)}</span></div><p className="mt-1 text-muted-foreground">{String(node.nodeType)} · attempt {String(node.attempt)}</p></div>) : <p className="text-sm text-muted-foreground">No node attempts for this run type.</p>}</div></section>
      <section className="mt-6"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h3><div className="mt-3 border-l border-wb-border pl-4">{events.length ? events.map(event => <div key={String(event.id)} className="relative mb-4 text-xs before:absolute before:-left-[19px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-accent-brand"><p className="font-medium">{String(event.type)}</p><p className="text-muted-foreground">{new Date(String(event.occurredAt)).toLocaleString()} · {String(event.actorName ?? event.actorId)}</p></div>) : <p className="text-sm text-muted-foreground">No correlated events recorded.</p>}</div></section>
    </aside>
  )
}

