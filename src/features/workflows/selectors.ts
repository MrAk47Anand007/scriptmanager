import type { RootState } from '@/store/store'
export const selectWorkflows = (state: RootState) => state.workflows.items
export const selectActiveWorkflow = (state: RootState) => state.workflows.active
export const selectSelectedWorkflowNode = (state: RootState) => state.workflows.active?.definition.nodes.find((node) => node.id === state.workflows.selectedNodeId) ?? null
export const selectWorkflowValidation = (state: RootState) => state.workflows.validation
