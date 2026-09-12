
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCopy, ClipboardPaste, GitBranch, Plus } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchWorkflows, selectWorkflow } from '@/features/workflows/workflowsSlice'
import { selectActiveWorkflow, selectWorkflows } from '@/features/workflows/selectors'
import { workflowTemplates } from '@/lib/workflows/templates'
import { createWorkflowRuntime } from '@/lib/workflowsRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

export function WorkflowSidebar() {
  const dispatch=useAppDispatch();const items=useAppSelector(selectWorkflows);const active=useAppSelector(selectActiveWorkflow);const [collapsed,setCollapsed]=useState(false);const [importOpen,setImportOpen]=useState(false);const [importText,setImportText]=useState('')
  useEffect(()=>{void dispatch(fetchWorkflows())},[dispatch])
  const create=async(templateKey?:keyof typeof workflowTemplates)=>{
    const definition=templateKey?workflowTemplates[templateKey].definition:{schemaVersion:1 as const,name:'Untitled workflow',nodes:[],edges:[]}
    try {
      const item=await createWorkflowRuntime({name:definition.name,definition})
      dispatch(selectWorkflow(item))
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to create workflow'))
      return
    }
    try {
      await dispatch(fetchWorkflows()).unwrap()
    } catch (error) {
      toast.error(getOperationError(error, 'Workflow list could not be refreshed'))
    }
  }
  const exportActive=async()=>{
    if(!active){toast.error('Select a workflow to export first');return}
    const payload=JSON.stringify(active.definition,null,2)
    if(window.scriptManagerDesktop?.copyText){await window.scriptManagerDesktop.copyText(payload)}
    else{await navigator.clipboard.writeText(payload)}
    toast.success('Workflow JSON copied — paste it into a file to share')
  }
  const importJson=async()=>{
    let parsed:unknown
    try{parsed=JSON.parse(importText)}catch{toast.error('Pasted text is not valid JSON');return}
    if(!parsed||typeof parsed!=='object'||!('nodes' in (parsed as object))){toast.error('Not a workflow definition (nodes/edges missing)');return}
    const definition=parsed as {name?:string}
    try {
      const item=await createWorkflowRuntime({name:definition.name?`${definition.name} (imported)`:'Imported workflow',definition:parsed as Parameters<typeof createWorkflowRuntime>[0]['definition']})
      dispatch(selectWorkflow(item))
      setImportOpen(false);setImportText('')
      await dispatch(fetchWorkflows()).unwrap()
      toast.success('Workflow imported')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to import workflow'))
    }
  }
  if(collapsed)return <div className="flex h-full w-10 flex-col items-center border-r border-wb-border py-2"><button aria-label="Expand workflows" onClick={()=>setCollapsed(false)} className="rounded p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4"/></button><GitBranch className="mt-4 h-4 w-4 text-muted-foreground"/></div>
  return <div className="flex h-full flex-col"><div className="flex h-11 items-center gap-1 border-b border-wb-border px-3"><span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workflows</span><button aria-label="New workflow" onClick={()=>void create()} className="rounded p-1.5 hover:bg-muted"><Plus className="h-4 w-4"/></button><button aria-label="Collapse workflows" onClick={()=>setCollapsed(true)} className="rounded p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4"/></button></div><div className="flex-1 overflow-y-auto py-1">{items.map((item)=><button key={item.id} onClick={()=>dispatch(selectWorkflow(item))} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${active?.id===item.id?'bg-accent-brand/10 text-foreground':'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}><GitBranch className="h-4 w-4 shrink-0"/><span className="truncate">{item.name}</span>{item.publishedVersion&&<span className="ml-auto text-[10px] text-emerald-500">v{item.publishedVersion}</span>}</button>)}</div><div className="border-t border-wb-border p-2"><div className="px-1 pb-1 text-[9px] uppercase tracking-wider text-muted-foreground">Start from template</div>{Object.entries(workflowTemplates).map(([key,template])=><button key={key} onClick={()=>void create(key as keyof typeof workflowTemplates)} className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">{template.name}</button>)}</div>
    <div className="border-t border-wb-border p-2">
      <div className="flex gap-1.5">
        <button aria-label="Export workflow JSON" onClick={()=>void exportActive()} className="flex flex-1 items-center justify-center gap-1 rounded border border-wb-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground"><ClipboardCopy className="h-3 w-3"/>Export</button>
        <button aria-label="Import workflow JSON" onClick={()=>setImportOpen((v)=>!v)} className="flex flex-1 items-center justify-center gap-1 rounded border border-wb-border px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-muted hover:text-foreground"><ClipboardPaste className="h-3 w-3"/>Import</button>
      </div>
      {importOpen&&<div className="mt-1.5 space-y-1"><textarea value={importText} onChange={(event)=>setImportText(event.target.value)} placeholder='Paste a workflow definition JSON (schemaVersion 1)…' className="h-28 w-full resize-none rounded border border-wb-border bg-background p-2 font-mono text-[10px] outline-none focus:border-accent-brand"/><button onClick={()=>void importJson()} disabled={!importText.trim()} className="w-full rounded bg-accent-brand px-2 py-1 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-40">Import workflow</button></div>}
    </div>
  </div>
}
