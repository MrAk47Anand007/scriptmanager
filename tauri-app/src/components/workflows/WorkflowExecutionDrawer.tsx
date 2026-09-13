
import { useEffect, useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, ChevronUp, CircleStop, History, LoaderCircle, RotateCcw, ShieldAlert, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow, selectSelectedExecution, selectSelectedWorkflowNode, selectWorkflowRuns } from '@/features/workflows/selectors'
import { cancelWorkflowRun, fetchWorkflowRun, fetchWorkflowRuns, resolveWorkflowApproval, retryWorkflowNode, selectNode, setSelectedExecution } from '@/features/workflows/workflowsSlice'
import { isWorkflowRunActive } from '@/lib/workflows/runStatus'
import { formatDurationMs } from '@/lib/observability/formatDuration'
import { diagnoseNodeRuntime } from '@/lib/workflowsRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

const labels: Record<string,string> = { pending:'Pending',running:'Running',succeeded:'Succeeded',failed:'Failed',waiting:'Waiting',waiting_approval:'Waiting for approval',skipped:'Skipped',interrupted:'Interrupted',cancelled:'Cancelled',queued:'Queued' }
const json = (value:unknown) => value===undefined||value===null?'No data':typeof value==='string'?value:JSON.stringify(value,null,2)
const duration = (start?: string|null, end?: string|null) => {
  if(!start||!end)return null
  const ms = new Date(end).getTime()-new Date(start).getTime()
  if(Number.isNaN(ms)||ms<0)return null
  return formatDurationMs(ms)
}

export function WorkflowExecutionDrawer() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  const runs = useAppSelector(selectWorkflowRuns)
  const detail = useAppSelector(selectSelectedExecution)
  const node = useAppSelector(selectSelectedWorkflowNode)
  const [expanded,setExpanded] = useState(true)
  const [tab,setTab] = useState<'output'|'input'|'logs'|'errors'>('output')
  const [diagnosis, setDiagnosis] = useState<string | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  useEffect(()=>{if(workflow)void dispatch(fetchWorkflowRuns(workflow.id))},[dispatch,workflow?.id])
  const shouldPoll = runs.some((run) => isWorkflowRunActive(run.status)) || isWorkflowRunActive(detail?.status) || detail?.status==='paused'
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
  const handleCancel = async (runId: string) => {
    try {
      await dispatch(cancelWorkflowRun(runId)).unwrap()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to cancel workflow run'))
    }
  }
  const handleRetry = async (runId: string, nodeId: string) => {
    try {
      await dispatch(retryWorkflowNode({ runId, nodeId })).unwrap()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to retry workflow node'))
    }
  }
  const handleApproval = async (runId: string, nodeId: string, approved: boolean) => {
    try {
      await dispatch(resolveWorkflowApproval({ runId, nodeId, approved })).unwrap()
      toast.success(approved ? 'Approved — workflow resumed' : 'Rejected — workflow failed')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to record approval decision'))
    }
  }
  const nodeRun = useMemo(()=>detail?.nodeRuns.find((item)=>item.nodeId===node?.id)??null,[detail,node?.id])
  const handleDiagnose = async (runId: string, nodeId: string) => {
    setDiagnosing(true)
    setDiagnosis(null)
    try {
      const result = await diagnoseNodeRuntime({ runId, nodeId })
      setDiagnosis(result.diagnosis)
    } catch (error) {
      toast.error(getOperationError(error, 'AI diagnosis failed'))
    } finally {
      setDiagnosing(false)
    }
  }
  if(!workflow)return null
  const tabValue = nodeRun ? tab==='input' ? nodeRun.input : tab==='errors' ? nodeRun.error : tab==='logs' ? (nodeRun.output as Record<string,unknown>|undefined)?.logs : nodeRun.output : undefined
  const errorMessage = nodeRun?.error && typeof nodeRun.error==='object' && 'message' in nodeRun.error ? String((nodeRun.error as {message:unknown}).message) : nodeRun?.error ? json(nodeRun.error) : null
  return <section aria-label="Workflow executions" className={`shrink-0 border-t border-wb-border bg-wb-sidepanel/70 ${expanded?'h-56':'h-9'}`}>
    <div className="flex h-9 items-center gap-2 px-3"><History className="h-3.5 w-3.5 text-muted-foreground"/><span className="text-[10px] font-semibold uppercase tracking-wider">Executions</span>{detail&&<span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" data-status={detail.status}>{labels[detail.status]??detail.status}</span>}<span className="flex-1"/>{detail&&['queued','running','waiting'].includes(detail.status)&&<button aria-label="Cancel run" onClick={()=>void handleCancel(detail.id)} className="flex items-center gap-1 rounded px-2 py-1 text-[10px] hover:bg-muted"><CircleStop className="h-3 w-3"/>Cancel</button>}<button aria-label={expanded?'Collapse executions':'Expand executions'} onClick={()=>setExpanded((value)=>!value)} className="rounded p-1 hover:bg-muted">{expanded?<ChevronDown className="h-3.5 w-3.5"/>:<ChevronUp className="h-3.5 w-3.5"/>}</button></div>
    {expanded&&<div className="flex h-[calc(100%-2.25rem)] border-t border-wb-border">
      <div className="w-52 shrink-0 overflow-y-auto border-r border-wb-border p-2">{runs.map((run)=><button key={run.id} onClick={()=>{dispatch(setSelectedExecution(run.id));void dispatch(fetchWorkflowRun(run.id))}} className={`mb-1 w-full rounded px-2 py-2 text-left ${detail?.id===run.id?'bg-muted':'hover:bg-muted/60'}`}><span className="flex items-center justify-between text-[11px] font-medium"><span>{labels[run.status]??run.status}</span><span className="text-[9px] text-muted-foreground">{new Date(run.createdAt).toLocaleTimeString()}</span></span><span className="mt-1 block truncate text-[9px] text-muted-foreground">{run.id}</span></button>)}{runs.length===0&&<p className="p-3 text-center text-[10px] text-muted-foreground">No runs yet.</p>}</div>
      <div className="min-w-0 flex-1 overflow-y-auto p-3">{!detail?<p className="text-xs text-muted-foreground">Select an execution to inspect it.</p>:!node?<div><div className="flex items-center gap-2"><span className="text-sm font-semibold">{labels[detail.status]??detail.status}</span><span className="text-[10px] text-muted-foreground">{duration(detail.startedAt, detail.finishedAt)!==null&&`ran in ${duration(detail.startedAt, detail.finishedAt)}`}</span></div>{detail.status==='paused'&&<div className="mt-2 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300"><ShieldAlert className="h-3.5 w-3.5 shrink-0"/>Paused at an approval node — select it below to approve or reject.</div>}<p className="mt-1 text-[11px] text-muted-foreground">Select a node to inspect its execution data.</p><div className="mt-3 flex flex-wrap gap-1">{detail.nodeRuns.map((item)=><button key={item.nodeId} onClick={()=>dispatch(selectNode(item.nodeId))} className="rounded border border-wb-border px-2 py-1 text-[10px] hover:bg-muted">{item.nodeId} · {labels[item.status]??item.status}{item.status==='waiting_approval'&&' ⚠'}</button>)}</div></div>:!nodeRun?<p className="text-xs text-muted-foreground">This node has no data in the selected run.</p>:<div>
        <div className="flex items-center gap-2"><span className="text-sm font-semibold">{node.name}</span><span className="text-[10px] text-muted-foreground">{labels[nodeRun.status]??nodeRun.status}</span><span className="text-[10px] text-muted-foreground">Attempt {nodeRun.attempt}</span>{duration(nodeRun.startedAt, nodeRun.finishedAt)!==null&&<span className="text-[10px] text-muted-foreground">· {duration(nodeRun.startedAt, nodeRun.finishedAt)}</span>}{nodeRun.status==='failed'&&<span className="ml-auto flex items-center gap-1"><button aria-label={`Diagnose ${node.name} with AI`} disabled={diagnosing} onClick={()=>void handleDiagnose(detail.id,node.id)} className="flex items-center gap-1 rounded border border-accent-brand/50 px-2 py-1 text-[10px] text-accent-brand hover:bg-accent-brand/10 disabled:opacity-50">{diagnosing?<LoaderCircle className="h-3 w-3 animate-spin"/>:<Bot className="h-3 w-3"/>}Diagnose</button><button aria-label={`Retry ${node.name}`} onClick={()=>void handleRetry(detail.id,node.id)} className="flex items-center gap-1 rounded bg-accent-brand px-2 py-1 text-[10px] text-white"><RotateCcw className="h-3 w-3"/>Retry</button></span>}{nodeRun.status==='waiting_approval'&&<span className="ml-auto flex items-center gap-1"><button aria-label={`Approve ${node.name}`} onClick={()=>void handleApproval(detail.id,node.id,true)} className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[10px] text-white hover:opacity-90"><Check className="h-3 w-3"/>Approve</button><button aria-label={`Reject ${node.name}`} onClick={()=>void handleApproval(detail.id,node.id,false)} className="flex items-center gap-1 rounded bg-destructive px-2 py-1 text-[10px] text-white hover:opacity-90"><X className="h-3 w-3"/>Reject</button></span>}</div>
        <div className="mt-2 flex gap-1">{(['output','input','logs','errors'] as const).map((item)=><button key={item} onClick={()=>setTab(item)} className={`rounded px-2 py-1 text-[10px] capitalize ${tab===item?'bg-muted font-semibold':'text-muted-foreground hover:bg-muted/60'}`}>{item}</button>)}</div>
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded border border-wb-border bg-background p-2 text-[10px]">{json(tabValue)}</pre>
        {errorMessage&&tab!=='errors'&&<p className="mt-2 text-[10px] text-destructive">{errorMessage}</p>}
        {diagnosis&&nodeRun.status==='failed'&&(
          <div className="mt-2 rounded border border-accent-brand/40 bg-accent-brand/5 p-2 text-[10px] leading-relaxed whitespace-pre-wrap text-foreground">
            <span className="mb-1 flex items-center gap-1 font-semibold text-accent-brand"><Bot className="h-3 w-3"/>AI diagnosis</span>
            {diagnosis}
          </div>
        )}
      </div>}</div>
    </div>}
  </section>
}
