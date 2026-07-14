export type WorkflowNodePosition = { x: number; y: number }

export type WorkflowEditorViewport = { x: number; y: number; zoom: number }

export type WorkflowEditorMetadata = {
  positions: Record<string, WorkflowNodePosition>
  viewport: WorkflowEditorViewport
}
