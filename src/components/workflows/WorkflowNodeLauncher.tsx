'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { listWorkflowNodeSpecs, type WorkflowNodeSpec } from '@/lib/workflows/nodeRegistry'
import type { WorkflowNodePosition } from '@/lib/workflows/editorTypes'

type Props = {
  open: boolean
  origin: WorkflowNodePosition
  onSelect: (spec: WorkflowNodeSpec, origin: WorkflowNodePosition) => void
  onClose: () => void
}

const categoryLabel: Record<WorkflowNodeSpec['category'], string> = {
  triggers: 'Triggers', actions: 'Actions', flow: 'Flow control', agents: 'AI agents', communication: 'Communication', plugins: 'Plugins',
}

export function WorkflowNodeLauncher({ open, origin, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return listWorkflowNodeSpecs().filter((spec) => !needle || [spec.label, spec.category, ...spec.keywords].some((value) => value.toLowerCase().includes(needle)))
  }, [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  if (!open) return null
  const choose = (spec: WorkflowNodeSpec) => { onSelect(spec, origin); onClose() }
  return <div className="absolute left-4 top-14 z-50 w-80 overflow-hidden rounded-lg border border-wb-border bg-popover shadow-2xl" role="dialog" aria-label="Add workflow node">
    <div className="flex items-center gap-2 border-b border-wb-border px-3"><Search className="h-4 w-4 text-muted-foreground"/><input ref={inputRef} role="combobox" aria-label="Search workflow nodes" aria-controls="workflow-node-results" aria-expanded="true" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(results.length - 1, index + 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)) }
      if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]) }
    }} placeholder="Search nodes…" className="h-11 flex-1 bg-transparent text-sm outline-none"/></div>
    <div id="workflow-node-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
      {results.map((spec, index) => { const Icon = spec.icon; const firstInCategory = index === 0 || results[index - 1].category !== spec.category; return <div key={spec.type}>{firstInCategory&&<div className="px-2 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{categoryLabel[spec.category]}</div>}<button role="option" aria-selected={index===activeIndex} onMouseEnter={()=>setActiveIndex(index)} onClick={()=>choose(spec)} className={`flex w-full items-start gap-3 rounded-md px-2 py-2 text-left ${index===activeIndex?'bg-muted':'hover:bg-muted/70'}`}><span className={`mt-0.5 rounded-md bg-${spec.color}-500/10 p-1.5 text-${spec.color}-500`}><Icon className="h-4 w-4"/></span><span><span className="block text-sm font-medium">{spec.label}</span><span className="block text-[11px] text-muted-foreground">{spec.description}</span></span></button></div> })}
      {results.length===0&&<div className="px-3 py-8 text-center text-xs text-muted-foreground">No nodes match “{query}”.</div>}
    </div>
  </div>
}
