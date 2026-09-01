import { planWorkflow } from './graph'
import type { WorkflowEditorMetadata, WorkflowNodePosition } from './editorTypes'
import type { WorkflowDefinition } from './types'

const HORIZONTAL_GAP = 280
const VERTICAL_GAP = 160

function fallbackLayout(definition: WorkflowDefinition): Record<string, WorkflowNodePosition> {
  return Object.fromEntries(definition.nodes.map((node, index) => [
    node.id,
    { x: index * HORIZONTAL_GAP, y: 0 },
  ]))
}

export function layoutWorkflowNodes(definition: WorkflowDefinition): Record<string, WorkflowNodePosition> {
  try {
    const layers = planWorkflow(definition)
    return Object.fromEntries(layers.flatMap((layer, column) => layer.map((nodeId, row) => [
      nodeId,
      { x: column * HORIZONTAL_GAP, y: row * VERTICAL_GAP },
    ])))
  } catch {
    return fallbackLayout(definition)
  }
}

export function normalizeEditorMetadata(definition: WorkflowDefinition): WorkflowEditorMetadata {
  const generated = layoutWorkflowNodes(definition)
  return {
    positions: Object.fromEntries(definition.nodes.map((node) => [
      node.id,
      definition.editor?.positions[node.id] ?? generated[node.id],
    ])),
    viewport: definition.editor?.viewport ?? { x: 0, y: 0, zoom: 1 },
  }
}
