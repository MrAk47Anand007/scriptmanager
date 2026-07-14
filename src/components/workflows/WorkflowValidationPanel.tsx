'use client'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow, selectWorkflowValidation } from '@/features/workflows/selectors'
import { selectNode } from '@/features/workflows/workflowsSlice'

export function WorkflowValidationPanel() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  const issues = useAppSelector(selectWorkflowValidation)
  if (issues.length===0) return null
  return <section aria-label="Workflow issues" className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2"><div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600"><AlertTriangle className="h-3.5 w-3.5"/>{issues.length} issue{issues.length===1?'':'s'}</div><div className="mt-1 flex gap-1 overflow-x-auto">{issues.map((issue,index)=><button key={`${issue.code}-${index}`} aria-label={issue.message} onClick={()=>{const match=issue.path?.match(/^nodes\[(\d+)\]/);if(match&&workflow)dispatch(selectNode(workflow.definition.nodes[Number(match[1])]?.id??null))}} className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-500/10">{issue.message}<ChevronRight className="h-3 w-3"/></button>)}</div></section>
}
