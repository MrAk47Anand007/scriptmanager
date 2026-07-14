import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@/store/store'
export const selectWorkflows = (state: RootState) => state.workflows.items
export const selectActiveWorkflow = (state: RootState) => state.workflows.active
export const selectSelectedWorkflowNode = (state: RootState) => state.workflows.active?.definition.nodes.find((node) => node.id === state.workflows.selectedNodeId) ?? null
export const selectWorkflowValidation = (state: RootState) => state.workflows.validation
export const selectWorkflowSelection = (state: RootState) => state.workflows.selectedNodeIds
export const selectWorkflowViewport = (state: RootState) => state.workflows.viewport
export const selectWorkflowHistory = (state: RootState) => state.workflows.history
export const selectWorkflowRequestState = createSelector([(state: RootState)=>state.workflows], (workflows) => ({ saveStatus: workflows.saveStatus, publishStatus: workflows.publishStatus, runStatus: workflows.runStatus, error: workflows.requestError }))
export const selectWorkflowRuns = (state: RootState) => state.workflows.runs
export const selectSelectedExecutionId = (state: RootState) => state.workflows.selectedExecutionId
