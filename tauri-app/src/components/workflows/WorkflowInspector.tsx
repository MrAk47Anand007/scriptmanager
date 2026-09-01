
import { useEffect, useState } from 'react'
import { Braces, SlidersHorizontal, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectSelectedWorkflowNode } from '@/features/workflows/selectors'
import { selectNode, updateNodeConfig } from '@/features/workflows/workflowsSlice'
import { getWorkflowNodeSpec, validateNodeConfig, type InspectorField } from '@/lib/workflows/nodeRegistry'

function Field({ field, value, onChange }: { field: InspectorField; value: unknown; onChange: (value: unknown) => void }) {
  const className = 'mt-1.5 w-full rounded-md border border-wb-border bg-background px-2.5 py-2 text-xs outline-none focus:border-accent-brand'
  if (field.kind === 'select') return <select aria-label={field.label} value={String(value ?? '')} onChange={(event)=>onChange(event.target.value)} className={className}><option value="">Select…</option>{field.options?.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select>
  if (field.kind === 'textarea') return <textarea aria-label={field.label} value={String(value ?? '')} onChange={(event)=>onChange(event.target.value)} rows={4} className={`${className} resize-y`}/>
  if (field.kind === 'json') return <textarea aria-label={field.label} value={JSON.stringify(value ?? {}, null, 2)} onChange={(event)=>{try{onChange(JSON.parse(event.target.value))}catch{}}} rows={6} className={`${className} resize-y font-mono`}/>
  return <input aria-label={field.label} type={field.kind==='number'?'number':'text'} min={field.min} value={field.kind==='number'?Number(value ?? 0):String(value ?? '')} onChange={(event)=>onChange(field.kind==='number'?Number(event.target.value):event.target.value)} className={className}/>
}

export function WorkflowInspector() {
  const dispatch = useAppDispatch()
  const node = useAppSelector(selectSelectedWorkflowNode)
  const [advanced, setAdvanced] = useState(false)
  const [json, setJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  useEffect(()=>{setJson(JSON.stringify(node?.config??{},null,2));setJsonError(null);setAdvanced(false)},[node?.id])
  if (!node) return <aside aria-label="Node inspector" className="w-72 shrink-0 border-l border-wb-border bg-wb-sidepanel/40 p-4 text-xs text-muted-foreground">Select a node to configure it.</aside>
  const spec = getWorkflowNodeSpec(node.type)
  const issues = validateNodeConfig(node)
  const update = (field: string, value: unknown) => dispatch(updateNodeConfig({ nodeId: node.id, config: { ...node.config, [field]: value } }))
  return <aside aria-label="Node inspector" className="w-72 shrink-0 overflow-y-auto border-l border-wb-border bg-wb-sidepanel/60">
    <div className="flex items-start gap-3 border-b border-wb-border p-4"><span className="rounded-md bg-accent-brand/10 p-2 text-accent-brand"><SlidersHorizontal className="h-4 w-4"/></span><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{spec.label}</div><h3 className="mt-1 truncate font-sans text-sm font-semibold tracking-normal">{node.name}</h3></div><button aria-label="Close inspector" onClick={()=>dispatch(selectNode(null))} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4"/></button></div>
    <div className="space-y-4 p-4">{!advanced&&spec.fields.map((field)=><label key={field.key} className="block"><span className="text-[10px] font-semibold text-muted-foreground">{field.label}{field.required&&<span aria-hidden="true" className="text-amber-500"> *</span>}</span><Field field={field} value={node.config[field.key]} onChange={(value)=>update(field.key,value)}/>{issues.find((issue)=>issue.field===field.key)&&<span className="mt-1 block text-[10px] text-amber-500">{issues.find((issue)=>issue.field===field.key)!.message}</span>}</label>)}
      {advanced&&<div><label className="text-[10px] font-semibold text-muted-foreground" htmlFor="workflow-config-json">Configuration JSON</label><textarea id="workflow-config-json" aria-label="Configuration JSON" value={json} onChange={(event)=>{const next=event.target.value;setJson(next);try{const parsed=JSON.parse(next);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error();setJsonError(null);dispatch(updateNodeConfig({nodeId:node.id,config:parsed}))}catch{setJsonError('Enter valid JSON before applying changes.')}}} rows={14} className="mt-1.5 w-full resize-y rounded-md border border-wb-border bg-background p-2 font-mono text-[11px] outline-none focus:border-accent-brand"/>{jsonError&&<p role="alert" className="mt-2 text-[10px] text-destructive">{jsonError}</p>}</div>}
      <button aria-label="Advanced JSON" onClick={()=>{setAdvanced((value)=>!value);setJson(JSON.stringify(node.config,null,2));setJsonError(null)}} className="flex w-full items-center justify-center gap-2 rounded-md border border-wb-border px-3 py-2 text-xs hover:bg-muted"><Braces className="h-3.5 w-3.5"/>{advanced?'Typed fields':'Advanced JSON'}</button>
    </div>
  </aside>
}
