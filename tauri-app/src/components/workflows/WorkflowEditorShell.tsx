
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow } from '@/features/workflows/selectors'
import { setValidation } from '@/features/workflows/workflowsSlice'
import { validateWorkflowEditor } from '@/lib/workflows/nodeRegistry'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowCommandBar } from './WorkflowCommandBar'
import { WorkflowExecutionDrawer } from './WorkflowExecutionDrawer'
import { WorkflowInspector } from './WorkflowInspector'
import { WorkflowValidationPanel } from './WorkflowValidationPanel'

export function WorkflowEditorShell() {
  const dispatch=useAppDispatch();const workflow=useAppSelector(selectActiveWorkflow)
  useEffect(()=>{if(!workflow)return;const timer=setTimeout(()=>dispatch(setValidation(validateWorkflowEditor(workflow.definition))),180);return()=>clearTimeout(timer)},[dispatch,workflow?.definition])
  return <div className="workflow-editor-shell flex h-full flex-col bg-background"><WorkflowCommandBar/><WorkflowValidationPanel/><div className="flex min-h-0 flex-1"><main aria-label="Workflow canvas" className="flex min-w-0 flex-1"><WorkflowCanvas/></main><div className="workflow-inspector"><WorkflowInspector/></div></div><WorkflowExecutionDrawer/></div>
}
