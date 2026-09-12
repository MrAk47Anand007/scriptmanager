
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow } from '@/features/workflows/selectors'
import { duplicateSelection, publishWorkflow, redoWorkflowEdit, runWorkflow, saveWorkflow, setValidation, undoWorkflowEdit } from '@/features/workflows/workflowsSlice'
import { validateWorkflowEditor } from '@/lib/workflows/nodeRegistry'
import { toast } from '@/components/ui/toast'
import { getOperationError } from '@/lib/operationError'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowCommandBar } from './WorkflowCommandBar'
import { WorkflowExecutionDrawer } from './WorkflowExecutionDrawer'
import { WorkflowInspector } from './WorkflowInspector'
import { WorkflowValidationPanel } from './WorkflowValidationPanel'

export function WorkflowEditorShell() {
  const dispatch=useAppDispatch();const workflow=useAppSelector(selectActiveWorkflow)
  useEffect(()=>{if(!workflow)return;const timer=setTimeout(()=>dispatch(setValidation(validateWorkflowEditor(workflow.definition))),180);return()=>clearTimeout(timer)},[dispatch,workflow?.definition])

  // Builder keyboard shortcuts: Ctrl+S save, Ctrl+Enter run, Ctrl+P publish,
  // Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo/redo, Ctrl+D duplicate. Node/edge
  // deletion is handled by the canvas (deleteKeyCode). Typing inside inputs
  // is ignored.
  useEffect(()=>{
    if(!workflow)return
    const handler=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement|null
      if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.isContentEditable||target.tagName==='SELECT'))return
      const mod=event.ctrlKey||event.metaKey
      if(mod&&event.key.toLowerCase()==='s'){
        event.preventDefault()
        void dispatch(saveWorkflow()).unwrap().then(()=>toast.success('Workflow saved')).catch((error)=>toast.error(getOperationError(error,'Failed to save workflow')))
      }else if(mod&&event.key==='Enter'){
        event.preventDefault()
        if(!workflow.publishedVersion){toast.error('Publish the workflow before running it');return}
        void dispatch(runWorkflow(workflow.id)).unwrap().then(()=>toast.success('Workflow run started')).catch((error)=>toast.error(getOperationError(error,'Failed to run workflow')))
      }else if(mod&&event.key.toLowerCase()==='p'&&!event.shiftKey){
        event.preventDefault()
        const issues=validateWorkflowEditor(workflow.definition)
        dispatch(setValidation(issues))
        if(issues.length>0)return
        void dispatch(publishWorkflow(workflow.id)).unwrap().then(()=>toast.success('Workflow published')).catch((error)=>toast.error(getOperationError(error,'Failed to publish workflow')))
      }else if(mod&&!event.shiftKey&&event.key.toLowerCase()==='z'){
        event.preventDefault()
        dispatch(undoWorkflowEdit())
      }else if(mod&&(event.shiftKey&&event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y')){
        event.preventDefault()
        dispatch(redoWorkflowEdit())
      }else if(mod&&event.key.toLowerCase()==='d'){
        event.preventDefault()
        dispatch(duplicateSelection())
      }
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[dispatch,workflow])

  return <div className="workflow-editor-shell flex h-full flex-col bg-background"><WorkflowCommandBar/><WorkflowValidationPanel/><div className="flex min-h-0 flex-1"><main aria-label="Workflow canvas" className="flex min-w-0 flex-1"><WorkflowCanvas/></main><div className="workflow-inspector"><WorkflowInspector/></div></div><WorkflowExecutionDrawer/></div>
}
