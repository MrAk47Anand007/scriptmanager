'use client'
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow } from '@/features/workflows/selectors'
import { setValidation } from '@/features/workflows/workflowsSlice'
import { validateWorkflowEditor } from '@/lib/workflows/nodeRegistry'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowCommandBar } from './WorkflowCommandBar'
import { WorkflowInspector } from './WorkflowInspector'
import { WorkflowValidationPanel } from './WorkflowValidationPanel'
import { WorkflowExecutionDrawer } from './WorkflowExecutionDrawer'

export function WorkflowBuilder() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  useEffect(()=>{if(!workflow)return;const timer=setTimeout(()=>dispatch(setValidation(validateWorkflowEditor(workflow.definition))),180);return()=>clearTimeout(timer)},[dispatch,workflow?.definition])
  return <div className="flex h-full flex-col bg-background"><WorkflowCommandBar/><WorkflowValidationPanel/><div className="flex min-h-0 flex-1"><WorkflowCanvas/><WorkflowInspector/></div><WorkflowExecutionDrawer/></div>
}
