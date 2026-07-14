import { createAsyncThunk, createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit'
import { normalizeEditorMetadata } from '@/lib/workflows/editorLayout'
import type { WorkflowEditorViewport, WorkflowNodePosition } from '@/lib/workflows/editorTypes'
import type { ValidationIssue, WorkflowDefinition, WorkflowEdge, WorkflowNodeType } from '@/lib/workflows/types'

export type WorkflowSummary = { id: string; name: string; description?: string; publishedVersion: number | null; projectId?: string | null; definition: WorkflowDefinition }
export type WorkflowRunSummary = { id: string; status: string; createdAt: string; nodeRuns?: unknown[] }
export type WorkflowNodeRunDetail = { nodeId: string; status: string; attempt: number; input?: unknown; output?: unknown; error?: unknown; startedAt?: string | null; finishedAt?: string | null }
export type WorkflowRunDetail = { id: string; status: string; createdAt: string; startedAt?: string | null; finishedAt?: string | null; nodeRuns: WorkflowNodeRunDetail[] }
type RequestStatus = 'idle' | 'saving' | 'publishing' | 'running' | 'failed'
type History = { past: WorkflowDefinition[]; future: WorkflowDefinition[] }
export type WorkflowState = {
  items: WorkflowSummary[]
  active: WorkflowSummary | null
  selectedNodeId: string | null
  selectedNodeIds: string[]
  selectedExecutionId: string | null
  validation: ValidationIssue[]
  dirty: boolean
  loading: boolean
  runs: WorkflowRunSummary[]
  executionDetails: Record<string, WorkflowRunDetail>
  viewport: WorkflowEditorViewport
  history: History
  saveStatus: RequestStatus
  publishStatus: RequestStatus
  runStatus: RequestStatus
  requestError: { operation: 'save' | 'publish' | 'run'; message: string } | null
}

const defaultViewport: WorkflowEditorViewport = { x: 0, y: 0, zoom: 1 }
const initialState: WorkflowState = {
  items: [], active: null, selectedNodeId: null, selectedNodeIds: [], selectedExecutionId: null,
  validation: [], dirty: false, loading: false, runs: [], executionDetails: {}, viewport: defaultViewport,
  history: { past: [], future: [] }, saveStatus: 'idle', publishStatus: 'idle', runStatus: 'idle', requestError: null,
}

const cloneDefinition = (definition: WorkflowDefinition): WorkflowDefinition => JSON.parse(JSON.stringify(definition)) as WorkflowDefinition

function remember(state: WorkflowState) {
  if (!state.active) return
  state.history.past.push(cloneDefinition(state.active.definition))
  if (state.history.past.length > 50) state.history.past.shift()
  state.history.future = []
}

function changed(state: WorkflowState) {
  state.dirty = true
  state.validation = []
}

function message(action: { error?: { message?: string } }) {
  return action.error?.message ?? 'Request failed'
}

export const fetchWorkflows = createAsyncThunk('workflows/fetch', async () => (await fetch('/api/workflows')).json())
export const saveWorkflow = createAsyncThunk('workflows/save', async (_, { getState }) => {
  const active = (getState() as { workflows: WorkflowState }).workflows.active!
  const response = await fetch(`/api/workflows/${active.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ definition: active.definition, projectId: active.projectId ?? null }) })
  if (!response.ok) throw new Error((await response.json()).error)
  return response.json()
})
export const publishWorkflow = createAsyncThunk('workflows/publish', async (id: string) => {
  const response = await fetch(`/api/workflows/${id}/publish`, { method: 'POST' })
  if (!response.ok) throw new Error((await response.json()).error)
  return response.json()
})
export const runWorkflow = createAsyncThunk('workflows/run', async (id: string) => {
  const response = await fetch(`/api/workflows/${id}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: {} }) })
  if (!response.ok) throw new Error((await response.json()).error)
  return response.json()
})
const parseJson = (value: unknown) => { if (typeof value !== 'string') return value; try { return JSON.parse(value) } catch { return value } }
export function normalizeWorkflowRunDetail(raw: Record<string, any>): WorkflowRunDetail {
  return { id: raw.id, status: raw.status, createdAt: String(raw.createdAt), startedAt: raw.startedAt?String(raw.startedAt):null, finishedAt: raw.finishedAt?String(raw.finishedAt):null, nodeRuns: (raw.nodeRuns??[]).map((node: Record<string, any>)=>({ nodeId: node.nodeId, status: node.status, attempt: node.attempt??1, input: parseJson(node.inputJson??node.input), output: parseJson(node.outputJson??node.output), error: parseJson(node.errorJson??node.error), startedAt: node.startedAt?String(node.startedAt):null, finishedAt: node.finishedAt?String(node.finishedAt):null })) }
}
export const fetchWorkflowRuns = createAsyncThunk('workflows/fetchRuns', async (workflowId: string) => {
  const response=await fetch(`/api/workflows/${workflowId}/runs`);if(!response.ok)throw new Error('Unable to load workflow runs');return response.json()
})
export const fetchWorkflowRun = createAsyncThunk('workflows/fetchRun', async (runId: string) => {
  const response=await fetch(`/api/workflow-runs/${runId}`);if(!response.ok)throw new Error('Unable to load workflow run');return normalizeWorkflowRunDetail(await response.json())
})
export const retryWorkflowNode = createAsyncThunk('workflows/retryNode', async ({runId,nodeId}:{runId:string;nodeId:string}) => {
  const response=await fetch(`/api/workflow-runs/${runId}/retry-node`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodeId})});if(!response.ok)throw new Error((await response.json()).error??'Retry failed');return normalizeWorkflowRunDetail(await response.json())
})
export const cancelWorkflowRun = createAsyncThunk('workflows/cancelRun', async (runId:string) => {
  const response=await fetch(`/api/workflow-runs/${runId}/cancel`,{method:'POST'});if(!response.ok)throw new Error((await response.json()).error??'Cancel failed');return normalizeWorkflowRunDetail(await response.json())
})

const slice = createSlice({
  name: 'workflows',
  initialState,
  reducers: {
    selectWorkflow(state, action: PayloadAction<WorkflowSummary>) {
      const definition = cloneDefinition(action.payload.definition)
      definition.editor = normalizeEditorMetadata(definition)
      state.active = { ...action.payload, definition }
      state.selectedNodeId = null
      state.selectedNodeIds = []
      state.selectedExecutionId = null
      state.validation = []
      state.dirty = false
      state.viewport = definition.editor.viewport
      state.history = { past: [], future: [] }
      state.requestError = null
    },
    selectNode(state, action: PayloadAction<string | null>) {
      state.selectedNodeId = action.payload
      state.selectedNodeIds = action.payload ? [action.payload] : []
    },
    selectNodes(state, action: PayloadAction<string[]>) {
      state.selectedNodeIds = action.payload
      state.selectedNodeId = action.payload.length === 1 ? action.payload[0] : null
    },
    addNode: {
      reducer(state, action: PayloadAction<{ id: string; type: WorkflowNodeType; name: string; config: Record<string, unknown>; position?: WorkflowNodePosition }>) {
        if (!state.active) return
        remember(state)
        const { position, ...node } = action.payload
        state.active.definition.nodes.push(node)
        state.active.definition.editor ??= normalizeEditorMetadata(state.active.definition)
        state.active.definition.editor.positions[node.id] = position ?? { x: 0, y: 0 }
        state.selectedNodeId = node.id
        state.selectedNodeIds = [node.id]
        changed(state)
      },
      prepare(input: { type: WorkflowNodeType; name: string; config: Record<string, unknown>; position?: WorkflowNodePosition }) {
        return { payload: { id: `node_${nanoid(8)}`, ...input } }
      },
    },
    updateNodeConfig(state, action: PayloadAction<{ nodeId: string; config: Record<string, unknown> }>) {
      const node = state.active?.definition.nodes.find((item) => item.id === action.payload.nodeId)
      if (!node) return
      remember(state)
      node.config = action.payload.config
      changed(state)
    },
    moveNodes(state, action: PayloadAction<Array<{ id: string; position: WorkflowNodePosition }>>) {
      if (!state.active || action.payload.length === 0) return
      remember(state)
      state.active.definition.editor ??= normalizeEditorMetadata(state.active.definition)
      for (const item of action.payload) state.active.definition.editor.positions[item.id] = item.position
      changed(state)
    },
    removeNodes(state, action: PayloadAction<string[]>) {
      if (!state.active || action.payload.length === 0) return
      remember(state)
      const ids = new Set(action.payload)
      state.active.definition.nodes = state.active.definition.nodes.filter((node) => !ids.has(node.id))
      state.active.definition.edges = state.active.definition.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target))
      for (const id of ids) delete state.active.definition.editor?.positions[id]
      state.selectedNodeIds = state.selectedNodeIds.filter((id) => !ids.has(id))
      if (state.selectedNodeId && ids.has(state.selectedNodeId)) state.selectedNodeId = null
      changed(state)
    },
    removeEdges(state, action: PayloadAction<string[]>) {
      if (!state.active || action.payload.length === 0) return
      remember(state)
      const ids = new Set(action.payload)
      state.active.definition.edges = state.active.definition.edges.filter((edge) => !ids.has(edge.id))
      changed(state)
    },
    connectNodes(state, action: PayloadAction<{ source: string; target: string; sourcePort?: 'true' | 'false' }>) {
      if (!state.active || action.payload.source === action.payload.target) return
      const duplicate = state.active.definition.edges.some((edge) => edge.source === action.payload.source && edge.target === action.payload.target && edge.sourcePort === action.payload.sourcePort)
      if (duplicate) return
      remember(state)
      state.active.definition.edges.push({ id: `edge_${nanoid(8)}`, ...action.payload })
      changed(state)
    },
    replaceConnection(state, action: PayloadAction<{ edgeId: string; source: string; target: string; sourcePort?: 'true' | 'false' }>) {
      const edge = state.active?.definition.edges.find((item) => item.id === action.payload.edgeId)
      if (!edge || action.payload.source === action.payload.target) return
      remember(state)
      Object.assign(edge, action.payload)
      changed(state)
    },
    duplicateSelection(state) {
      if (!state.active || state.selectedNodeIds.length === 0) return
      remember(state)
      const selected = new Set(state.selectedNodeIds)
      const idMap = new Map<string, string>()
      const copies = state.active.definition.nodes.filter((node) => selected.has(node.id)).map((node) => {
        const id = `node_${nanoid(8)}`
        idMap.set(node.id, id)
        return { ...cloneDefinition({ schemaVersion: 1, name: '', nodes: [node], edges: [] }).nodes[0], id }
      })
      state.active.definition.nodes.push(...copies)
      state.active.definition.editor ??= normalizeEditorMetadata(state.active.definition)
      for (const [oldId, newId] of idMap) {
        const oldPosition = state.active.definition.editor.positions[oldId] ?? { x: 0, y: 0 }
        state.active.definition.editor.positions[newId] = { x: oldPosition.x + 32, y: oldPosition.y + 32 }
      }
      const copiedEdges: WorkflowEdge[] = state.active.definition.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)).map((edge) => ({ ...edge, id: `edge_${nanoid(8)}`, source: idMap.get(edge.source)!, target: idMap.get(edge.target)! }))
      state.active.definition.edges.push(...copiedEdges)
      state.selectedNodeIds = copies.map((node) => node.id)
      state.selectedNodeId = copies.length === 1 ? copies[0].id : null
      changed(state)
    },
    undoWorkflowEdit(state) {
      if (!state.active) return
      const previous = state.history.past.pop()
      if (!previous) return
      state.history.future.unshift(cloneDefinition(state.active.definition))
      state.active.definition = previous
      state.viewport = previous.editor?.viewport ?? defaultViewport
      changed(state)
    },
    redoWorkflowEdit(state) {
      if (!state.active) return
      const next = state.history.future.shift()
      if (!next) return
      state.history.past.push(cloneDefinition(state.active.definition))
      state.active.definition = next
      state.viewport = next.editor?.viewport ?? defaultViewport
      changed(state)
    },
    setViewport(state, action: PayloadAction<WorkflowEditorViewport>) {
      state.viewport = action.payload
      if (state.active?.definition.editor) state.active.definition.editor.viewport = action.payload
    },
    setWorkflowProject(state, action: PayloadAction<string | null>) {
      if (!state.active) return
      remember(state)
      state.active.projectId = action.payload
      changed(state)
    },
    setValidation(state, action: PayloadAction<ValidationIssue[]>) { state.validation = action.payload },
    setSelectedExecution(state, action: PayloadAction<string | null>) { state.selectedExecutionId = action.payload },
    setWorkflowRuns(state, action: PayloadAction<WorkflowRunSummary[]>) { state.runs = action.payload },
    setExecutionDetail(state, action: PayloadAction<WorkflowRunDetail>) { state.executionDetails[action.payload.id] = action.payload },
    clearWorkflowRequestError(state) { state.requestError = null },
  },
  extraReducers(builder) {
    builder
      .addCase(fetchWorkflows.pending, (state) => { state.loading = true })
      .addCase(fetchWorkflows.fulfilled, (state, action) => { state.items = action.payload; state.loading = false })
      .addCase(fetchWorkflows.rejected, (state) => { state.loading = false })
      .addCase(saveWorkflow.pending, (state) => { state.saveStatus = 'saving'; state.requestError = null })
      .addCase(saveWorkflow.fulfilled, (state) => { state.dirty = false; state.saveStatus = 'idle' })
      .addCase(saveWorkflow.rejected, (state, action) => { state.saveStatus = 'failed'; state.requestError = { operation: 'save', message: message(action) } })
      .addCase(publishWorkflow.pending, (state) => { state.publishStatus = 'publishing'; state.requestError = null })
      .addCase(publishWorkflow.fulfilled, (state, action) => { if (state.active) state.active.publishedVersion = action.payload.version; state.publishStatus = 'idle' })
      .addCase(publishWorkflow.rejected, (state, action) => { state.publishStatus = 'failed'; state.requestError = { operation: 'publish', message: message(action) } })
      .addCase(runWorkflow.pending, (state) => { state.runStatus = 'running'; state.requestError = null })
      .addCase(runWorkflow.fulfilled, (state, action) => { state.runs.unshift(action.payload); state.runStatus = 'idle'; state.selectedExecutionId = action.payload.id })
      .addCase(runWorkflow.rejected, (state, action) => { state.runStatus = 'failed'; state.requestError = { operation: 'run', message: message(action) } })
      .addCase(fetchWorkflowRuns.fulfilled, (state, action) => { state.runs = action.payload })
      .addCase(fetchWorkflowRun.fulfilled, (state, action) => { state.executionDetails[action.payload.id] = action.payload })
      .addCase(retryWorkflowNode.fulfilled, (state, action) => { state.executionDetails[action.payload.id] = action.payload })
      .addCase(cancelWorkflowRun.fulfilled, (state, action) => { state.executionDetails[action.payload.id] = action.payload })
  },
})

export const {
  selectWorkflow, selectNode, selectNodes, addNode, updateNodeConfig, moveNodes, removeNodes, removeEdges,
  connectNodes, replaceConnection, duplicateSelection, undoWorkflowEdit, redoWorkflowEdit, setViewport,
  setWorkflowProject, setValidation, setSelectedExecution, setWorkflowRuns, setExecutionDetail, clearWorkflowRequestError,
} = slice.actions
export default slice.reducer
