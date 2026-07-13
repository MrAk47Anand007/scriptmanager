import { createAsyncThunk, createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import type { ValidationIssue, WorkflowDefinition, WorkflowNodeType } from '@/lib/workflows/types'

export type WorkflowSummary = { id: string; name: string; description?: string; publishedVersion: number | null; definition: WorkflowDefinition }
type State = { items: WorkflowSummary[]; active: WorkflowSummary | null; selectedNodeId: string | null; validation: ValidationIssue[]; dirty: boolean; loading: boolean; runs: Array<{ id: string; status: string; createdAt: string }> }
const initialState: State = { items: [], active: null, selectedNodeId: null, validation: [], dirty: false, loading: false, runs: [] }

export const fetchWorkflows = createAsyncThunk('workflows/fetch', async () => (await fetch('/api/workflows')).json())
export const saveWorkflow = createAsyncThunk('workflows/save', async (_, { getState }) => {
  const active = (getState() as { workflows: State }).workflows.active!
  const response = await fetch(`/api/workflows/${active.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition: active.definition }) })
  if (!response.ok) throw new Error((await response.json()).error)
  return response.json()
})
export const publishWorkflow = createAsyncThunk('workflows/publish', async (id: string) => {
  const response = await fetch(`/api/workflows/${id}/publish`, { method: 'POST' }); if (!response.ok) throw new Error((await response.json()).error); return response.json()
})
export const runWorkflow = createAsyncThunk('workflows/run', async (id: string) => {
  const response = await fetch(`/api/workflows/${id}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: {} }) }); if (!response.ok) throw new Error((await response.json()).error); return response.json()
})

const slice = createSlice({
  name: 'workflows', initialState,
  reducers: {
    selectWorkflow(state, action: PayloadAction<WorkflowSummary>) { state.active = action.payload; state.selectedNodeId = null; state.validation = []; state.dirty = false },
    selectNode(state, action: PayloadAction<string | null>) { state.selectedNodeId = action.payload },
    addNode: { reducer(state, action: PayloadAction<{ id: string; type: WorkflowNodeType; name: string; config: Record<string, unknown> }>) { if (!state.active) return; state.active.definition.nodes.push(action.payload); state.selectedNodeId = action.payload.id; state.dirty = true }, prepare(input: { type: WorkflowNodeType; name: string; config: Record<string, unknown> }) { return { payload: { id: `node_${nanoid(8)}`, ...input } } } },
    updateNodeConfig(state, action: PayloadAction<{ nodeId: string; config: Record<string, unknown> }>) { const node = state.active?.definition.nodes.find((item) => item.id === action.payload.nodeId); if (node) { node.config = action.payload.config; state.dirty = true } },
    connectNodes(state, action: PayloadAction<{ source: string; target: string }>) { if (!state.active || action.payload.source === action.payload.target) return; if (!state.active.definition.edges.some((edge) => edge.source === action.payload.source && edge.target === action.payload.target)) { state.active.definition.edges.push({ id: `edge_${nanoid(8)}`, ...action.payload }); state.dirty = true } },
    setValidation(state, action: PayloadAction<ValidationIssue[]>) { state.validation = action.payload },
  },
  extraReducers(builder) { builder.addCase(fetchWorkflows.pending, (state) => { state.loading = true }).addCase(fetchWorkflows.fulfilled, (state, action) => { state.items = action.payload; state.loading = false }).addCase(saveWorkflow.fulfilled, (state) => { state.dirty = false }).addCase(publishWorkflow.fulfilled, (state, action) => { if (state.active) state.active.publishedVersion = action.payload.version }).addCase(runWorkflow.fulfilled, (state, action) => { state.runs.unshift(action.payload) }) },
})
export const { selectWorkflow, selectNode, addNode, updateNodeConfig, connectNodes, setValidation } = slice.actions
export default slice.reducer
