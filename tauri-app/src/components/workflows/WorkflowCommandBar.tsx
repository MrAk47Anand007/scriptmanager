
import { Play, Redo2, Save, Undo2, Upload, WandSparkles } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow, selectWorkflowHistory, selectWorkflowRequestState, selectWorkflowValidation } from '@/features/workflows/selectors'
import { publishWorkflow, redoWorkflowEdit, runWorkflow, saveWorkflow, setValidation, undoWorkflowEdit } from '@/features/workflows/workflowsSlice'
import { validateWorkflowEditor } from '@/lib/workflows/nodeRegistry'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

export function WorkflowCommandBar() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  const dirty = useAppSelector((state)=>state.workflows.dirty)
  const issues = useAppSelector(selectWorkflowValidation)
  const history = useAppSelector(selectWorkflowHistory)
  const request = useAppSelector(selectWorkflowRequestState)
  if (!workflow) return <header className="flex h-12 items-center border-b border-wb-border px-4 text-sm font-semibold">Workflow builder</header>
  const validate = () => { const next=validateWorkflowEditor(workflow.definition);dispatch(setValidation(next));return next }
  const handleSave = async () => {
    try {
      await dispatch(saveWorkflow()).unwrap()
      toast.success('Workflow saved')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save workflow'))
    }
  }
  const handlePublish = async () => {
    if (validate().length > 0) return
    try {
      await dispatch(publishWorkflow(workflow.id)).unwrap()
      toast.success('Workflow published')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to publish workflow'))
    }
  }
  const handleRun = async () => {
    try {
      await dispatch(runWorkflow(workflow.id)).unwrap()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to run workflow'))
    }
  }
  const status = request.saveStatus==='saving'?'Saving…':dirty?'Unsaved changes':'Saved'
  return <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-wb-border px-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{workflow.name}</div><div className="text-[10px] text-muted-foreground">{status} · {workflow.definition.nodes.length} nodes · {workflow.publishedVersion?`published v${workflow.publishedVersion}`:'draft'}</div></div><button aria-label="Undo" disabled={!history.past.length} onClick={()=>dispatch(undoWorkflowEdit())} className="rounded p-2 hover:bg-muted disabled:opacity-35"><Undo2 className="h-3.5 w-3.5"/></button><button aria-label="Redo" disabled={!history.future.length} onClick={()=>dispatch(redoWorkflowEdit())} className="rounded p-2 hover:bg-muted disabled:opacity-35"><Redo2 className="h-3.5 w-3.5"/></button><span className="mx-1 h-5 w-px bg-wb-border"/><button aria-label="Save" disabled={!dirty||request.saveStatus==='saving'} onClick={()=>void handleSave()} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-35"><Save className="h-3.5 w-3.5"/>Save</button><button aria-label="Validate" onClick={validate} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted"><WandSparkles className="h-3.5 w-3.5"/>Validate</button><button aria-label="Publish" disabled={issues.length>0||request.publishStatus==='publishing'} onClick={()=>void handlePublish()} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-35"><Upload className="h-3.5 w-3.5"/>Publish</button><button aria-label="Run workflow" disabled={!workflow.publishedVersion||request.runStatus==='running'} onClick={()=>void handleRun()} className="flex items-center gap-1.5 rounded bg-accent-brand px-3 py-1.5 text-xs text-white disabled:opacity-35"><Play className="h-3.5 w-3.5"/>{request.runStatus==='running'?'Running…':'Run'}</button></header>
}
