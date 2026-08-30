'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CircleStop, History, RotateCcw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow, selectSelectedExecution, selectSelectedWorkflowNode, selectWorkflowRuns } from '@/features/workflows/selectors'
import { cancelWorkflowRun, fetchWorkflowRun, fetchWorkflowRuns, retryWorkflowNode, selectNode, setSelectedExecution } from '@/features/workflows/workflowsSlice'
import { isWorkflowRunActive } from '@/lib/workflows/runStatus'

const labels: Record<string,string> = { pending:'Pending',running:'Running',succeeded:'Succeeded',failed:'Failed',waiting:'Waiting',waiting_approval:'Waiting for approval',skipped:'Skipped',interrupted:'Interrupted',cancelled:'Cancelled',queued:'Queued' }
const json = (value:unknown) => value===undefined||value===null?'No data':typeof value==='string'?value:JSON.stringify(value,null,2)

export function WorkflowExecutionDrawer() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  const runs = useAppSelector(selectWorkflowRuns)
  const detail = useAppSelector(selectSelectedExecution)
  const node = useAppSelector(selectSelectedWorkflowNode)
  const [expanded,setExpanded] = useState(true)
  const [tab,setTab] = useState<'output'|'input'|'logs'|'errors'>('output')
  useEffect(()=>{if(workflow)void dispatch(fetchWorkflowRuns(workflow.id))},[dispatch,workflow?.id])
  const shouldPoll = runs.some((run) => isWorkflowRunActive(run.status)) || isWorkflowRunActive(detail?.status)
  useEffect(() => {
    if (!workflow?.id || !shouldPoll) return
    const workflowId = workflow.id
    const detailId = detail?.id
    let inFlight = false
    const refresh = () => {
      if (inFlight) return
      inFlight = true
      void Promise.all([
        dispatch(fetchWorkflowRuns(workflowId)),
        detailId ? dispatch(fetchWorkflowRun(detailId)) : Promise.resolve(),
      ]).finally(() => {
        inFlight = false
      })
    }
    const timer = window.setInterval(refresh, 2_000)
    return () => window.clearInterval(timer)
  }, [detail?.id, dispatch, shouldPoll, workflow?.id])
  const nodeRun = useMemo(()=>detail?.nodeRuns.find((item)=>item.nodeId===node?.id)??null,[detail,node?.id])
  if(!workflow)return null
  const tabValue = nodeRun ? tab==='input' ? nodeRun.input : tab==='errors' ? nodeRun.error : tab==='logs' ? (nodeRun.output as Record<string,unknown>|undefined)?.logs : nodeRun.output : undefined
  const errorMessage = nodeRun?.error && typeof nodeRun.error==='object' && 'message' in nodeRun.error ? String((nodeRun.error as {message:unknown}).message) : nodeRun?.error ? json(nodeRun.error) : null
  return <section aria-label="Workflow executions" className={`shrink-0 border-t border-wb-border bg-wb-sidepanel/70 ${expanded?'h-56':'h-9'}`}>
    <div className="flex h-9 items-center gap-2 px-3"><History className="h-3.5 w-3.5 text-muted-foreground"/><span className="text-[10px] font-semibold uppercase tracking-wider">Executions</span>{detail&&<span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" data-status={detail.status}>{labels[detail.status]??detail.status}</span>}<span className="flex-1"/>{detail&&['queued','running','waiting'].includes(detail.status)&&<button aria-label="Cancel run" onClick={()=>void dispatch(cancelWorkflowRun(detail.id))} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-muted"><CircleStop className="h-3 w-3"/>Cancel</button>}<button aria-label={expanded?'Collapse executions':'Expand executions'} onClick={()=>setExpanded((value)=>!value)} className="rounded p-1 hover:bg-muted">{expanded?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronUp className="h-3.5 w-3.5"/>}</button></div>
    {expanded&&<div className="flex h-[calc(100%-2.25rem)] border-t border-wb-border">
      <div className="w-52 shrink-0 overflow-y-auto border-r border-wb-border p-2">{runs.map((run)=><button key={run.id} onClick={()=>{dispatch(setSelectedExecution(run.id));void dispatch(fetchWorkflowRun(run.id))}} className={`mb-1 w-full rounded px-2 py-2 text-left ${detail?.id===run.id?'bg-muted':'hover:bg-muted/60'}`}><span className="flex items-center justify-between text-[11px] font-medium"><span>{labels[run.status]??run.status}</span><span className="text-[9px] text-muted-foreground">{new Date(run.createdAt).toLocaleTimeString()}</span></span><span className="mt-1 block truncate text-[9px] text-muted-foreground">{run.id}</span></button>)}{runs.length===0&&<p className="p-3 text-center text-[10px] text-muted-foreground">No runs yet.</p>}</div>
      <div className="min-w-0 flex-1 overflow-y-auto p-3">{!detail?<p className="text-xs text-muted-foreground">Select an execution to inspect it.</p>:!node?<div><div className="text-sm font-semibold">{labels[detail.status]??detail.status}</div><p className="mt-1 text-[11px] text-muted-foreground">Select a node to inspect its execution data.</p><div className="mt-3 flex flex-wrap gap-1">{detail.nodeRuns.map((item)=><button key={item.nodeId} onClick={()=>dispatch(selectNode(item.nodeId))} className="rounded border border-wb-border px-2 py-1 text-[10px] hover:bg-muted">{item.nodeId} · {labels[item.status]??item.status}</button>)}</div></div>:!nodeRun?<p className="text-xs text-muted-foreground">This node has no data in the selected run.</p>:<div>
        <div className="flex items-center gap-2"><span className="text-sm font-semibold">{node.name}</span><span className="text-[10px] text-muted-foreground">{labels[nodeRun.status]??nodeRun.status}</span><span className="text-[10px] text-muted-foreground">Attempt {nodeRun.attempt}</span>{nodeRun.status==='failed'&&<button aria-label={`Retry ${node.name}`} onClick={()=>void dispatch(retryWorkflowNode({runId:detail.id,nodeId:node.id}))} className="ml-auto flex items-center gap-1 rounded bg-accent-brand px-2 py-1 text-[10px] text-white"><RotateCcw className="h-3 w-3"/>Retry</button>}</div>
        <div className="mt-2 flex gap-1">{(['output','input','logs','errors'] as const).map((item)=><button key={item} onClick={()=>setTab(item)} className={`rounded px-2 py-1 text-[10px] capitalize ${tab===item?'bg-muted font-semibold':'text-muted-foreground hover:bg-muted/60'}`}>{item}</button>)}</div>
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-wb-border bg-background p-2 text-[10px]">{json(tabValue)}</pre>
        {errorMessage&&tab!=='errors'&&<p className="mt-2 text-[10px] text-destructive">{errorMessage}</p>}
      </div>}</div>
    </div>}
  </section>
}
