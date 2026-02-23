import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeyValueRow {
  id: string
  key: string
  value: string
  enabled: boolean
}

export interface ApiCollection {
  id: string
  name: string
  description: string
  request_count: number
  created_at: string
  updated_at: string
}

export interface ApiRequest {
  id: string
  name: string
  method: string
  url: string
  headers: string       // JSON string: KeyValueRow[]
  query_params: string  // JSON string: KeyValueRow[]
  body_type: string
  body: string
  auth_type: string
  auth_config: string   // JSON string: Record<string, string>
  collection_id: string | null
  created_at: string
  updated_at: string
}

export interface ApiRequestDraft {
  id?: string
  name: string
  method: string
  url: string
  headers: KeyValueRow[]
  queryParams: KeyValueRow[]
  bodyType: 'none' | 'json' | 'form' | 'raw'
  body: string
  authType: 'none' | 'bearer' | 'basic' | 'apikey'
  authConfig: Record<string, string>
  collectionId?: string | null
}

export interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number
  size: number
  error?: string
  truncated?: boolean
  timestamp: number
}

export interface ApiHistoryEntry {
  id: string
  request_id: string | null
  method: string
  url: string
  request_headers: string
  request_body: string
  status: number
  status_text: string
  duration: number
  size: number
  response_headers: string
  response_body: string
  created_at: string
}

interface ApiState {
  collections: ApiCollection[]
  requests: ApiRequest[]
  activeRequestId: string | null
  activeRequest: ApiRequestDraft | null
  response: ApiResponse | null
  history: ApiHistoryEntry[]
  isLoading: boolean
  isSending: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blankDraft(): ApiRequestDraft {
  return {
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    headers: [{ id: uuidv4(), key: '', value: '', enabled: true }],
    queryParams: [{ id: uuidv4(), key: '', value: '', enabled: true }],
    bodyType: 'none',
    body: '',
    authType: 'none',
    authConfig: {},
    collectionId: null
  }
}

function requestToDraft(request: ApiRequest): ApiRequestDraft {
  let headers: KeyValueRow[] = []
  let queryParams: KeyValueRow[] = []
  let authConfig: Record<string, string> = {}

  try { headers = JSON.parse(request.headers) } catch { /* empty */ }
  try { queryParams = JSON.parse(request.query_params) } catch { /* empty */ }
  try { authConfig = JSON.parse(request.auth_config) } catch { /* empty */ }

  // Ensure at least one blank row in each table
  if (headers.length === 0) headers = [{ id: uuidv4(), key: '', value: '', enabled: true }]
  if (queryParams.length === 0) queryParams = [{ id: uuidv4(), key: '', value: '', enabled: true }]

  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers,
    queryParams,
    bodyType: request.body_type as ApiRequestDraft['bodyType'],
    body: request.body,
    authType: request.auth_type as ApiRequestDraft['authType'],
    authConfig,
    collectionId: request.collection_id
  }
}

function draftToApiPayload(draft: ApiRequestDraft) {
  return {
    name: draft.name,
    method: draft.method,
    url: draft.url,
    headers: JSON.stringify(draft.headers.filter(h => h.key)),
    query_params: JSON.stringify(draft.queryParams.filter(p => p.key)),
    body_type: draft.bodyType,
    body: draft.body,
    auth_type: draft.authType,
    auth_config: JSON.stringify(draft.authConfig),
    collection_id: draft.collectionId ?? null
  }
}

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchApiCollections = createAsyncThunk('api/fetchCollections', async () => {
  const res = await axios.get<ApiCollection[]>('/api/api-collections')
  return res.data
})

export const fetchApiRequests = createAsyncThunk('api/fetchRequests', async () => {
  const res = await axios.get<ApiRequest[]>('/api/api-requests')
  return res.data
})

export const createApiCollection = createAsyncThunk(
  'api/createCollection',
  async ({ name, description }: { name: string; description?: string }) => {
    const res = await axios.post<ApiCollection>('/api/api-collections', { name, description: description ?? '' })
    return res.data
  }
)

export const updateApiCollection = createAsyncThunk(
  'api/updateCollection',
  async ({ id, name, description }: { id: string; name: string; description?: string }) => {
    const res = await axios.put<ApiCollection>(`/api/api-collections/${id}`, { name, description: description ?? '' })
    return res.data
  }
)

export const deleteApiCollection = createAsyncThunk(
  'api/deleteCollection',
  async (id: string) => {
    await axios.delete(`/api/api-collections/${id}`)
    return id
  }
)

export const saveApiRequest = createAsyncThunk(
  'api/saveRequest',
  async (draft: ApiRequestDraft) => {
    const payload = draftToApiPayload(draft)
    let res: { data: ApiRequest }

    if (draft.id) {
      res = await axios.put<ApiRequest>(`/api/api-requests/${draft.id}`, payload)
    } else {
      res = await axios.post<ApiRequest>('/api/api-requests', payload)
    }

    return res.data
  }
)

export const deleteApiRequest = createAsyncThunk(
  'api/deleteRequest',
  async (id: string) => {
    await axios.delete(`/api/api-requests/${id}`)
    return id
  }
)

export const sendApiRequest = createAsyncThunk(
  'api/sendRequest',
  async (draft: ApiRequestDraft) => {
    const payload = {
      method: draft.method,
      url: draft.url,
      headers: draft.headers,
      queryParams: draft.queryParams,
      bodyType: draft.bodyType,
      body: draft.body,
      authType: draft.authType,
      authConfig: draft.authConfig
    }
    const res = await axios.post('/api/proxy-request', payload)
    return { ...res.data, timestamp: Date.now() } as ApiResponse
  }
)

export const fetchApiHistory = createAsyncThunk('api/fetchHistory', async () => {
  const res = await axios.get<ApiHistoryEntry[]>('/api/api-history')
  return res.data
})

export const clearApiHistory = createAsyncThunk('api/clearHistory', async () => {
  await axios.delete('/api/api-history')
})

// ─── Slice ────────────────────────────────────────────────────────────────────

const initialState: ApiState = {
  collections: [],
  requests: [],
  activeRequestId: null,
  activeRequest: null,
  response: null,
  history: [],
  isLoading: false,
  isSending: false,
  error: null
}

const apiSlice = createSlice({
  name: 'api',
  initialState,
  reducers: {
    setActiveRequest(state, action: PayloadAction<string>) {
      const request = state.requests.find(r => r.id === action.payload)
      if (request) {
        state.activeRequestId = request.id
        state.activeRequest = requestToDraft(request)
        state.response = null
      }
    },
    updateDraft(state, action: PayloadAction<Partial<ApiRequestDraft>>) {
      if (state.activeRequest) {
        state.activeRequest = { ...state.activeRequest, ...action.payload }
      }
    },
    newRequest(state) {
      state.activeRequestId = null
      state.activeRequest = blankDraft()
      state.response = null
    },
    clearResponse(state) {
      state.response = null
    },
    loadHistoryEntry(state, action: PayloadAction<ApiHistoryEntry>) {
      const entry = action.payload
      let headers: KeyValueRow[] = []
      let queryParams: KeyValueRow[] = []

      try {
        const parsed = JSON.parse(entry.request_headers) as Record<string, string>
        headers = Object.entries(parsed).map(([key, value]) => ({
          id: uuidv4(), key, value, enabled: true
        }))
      } catch { /* empty */ }

      if (headers.length === 0) headers = [{ id: uuidv4(), key: '', value: '', enabled: true }]
      if (queryParams.length === 0) queryParams = [{ id: uuidv4(), key: '', value: '', enabled: true }]

      state.activeRequestId = null
      state.activeRequest = {
        name: `${entry.method} ${entry.url}`,
        method: entry.method,
        url: entry.url,
        headers,
        queryParams,
        bodyType: 'none',
        body: entry.request_body ?? '',
        authType: 'none',
        authConfig: {},
        collectionId: null
      }
      state.response = null
    }
  },
  extraReducers: (builder) => {
    // fetchApiCollections
    builder
      .addCase(fetchApiCollections.pending, (state) => { state.isLoading = true })
      .addCase(fetchApiCollections.fulfilled, (state, action) => {
        state.isLoading = false
        state.collections = action.payload
      })
      .addCase(fetchApiCollections.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message ?? 'Failed to fetch collections'
      })

    // fetchApiRequests
    builder
      .addCase(fetchApiRequests.pending, (state) => { state.isLoading = true })
      .addCase(fetchApiRequests.fulfilled, (state, action) => {
        state.isLoading = false
        state.requests = action.payload
      })
      .addCase(fetchApiRequests.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message ?? 'Failed to fetch requests'
      })

    // createApiCollection
    builder
      .addCase(createApiCollection.fulfilled, (state, action) => {
        state.collections.push(action.payload)
        state.collections.sort((a, b) => a.name.localeCompare(b.name))
      })

    // updateApiCollection
    builder
      .addCase(updateApiCollection.fulfilled, (state, action) => {
        const idx = state.collections.findIndex(c => c.id === action.payload.id)
        if (idx !== -1) {
          state.collections[idx] = { ...state.collections[idx], ...action.payload }
          state.collections.sort((a, b) => a.name.localeCompare(b.name))
        }
      })

    // deleteApiCollection
    builder
      .addCase(deleteApiCollection.fulfilled, (state, action) => {
        state.collections = state.collections.filter(c => c.id !== action.payload)
        // Requests with that collection get collectionId = null (handled server-side)
        state.requests = state.requests.map(r =>
          r.collection_id === action.payload ? { ...r, collection_id: null } : r
        )
      })

    // saveApiRequest
    builder
      .addCase(saveApiRequest.fulfilled, (state, action) => {
        const saved = action.payload
        const idx = state.requests.findIndex(r => r.id === saved.id)
        if (idx !== -1) {
          state.requests[idx] = saved
        } else {
          state.requests.unshift(saved)
        }
        // Update active request ID and draft ID
        state.activeRequestId = saved.id
        if (state.activeRequest) {
          state.activeRequest.id = saved.id
        }
        // Update collection request counts
        if (saved.collection_id) {
          const col = state.collections.find(c => c.id === saved.collection_id)
          if (col) col.request_count = (col.request_count || 0) + 1
        }
      })

    // deleteApiRequest
    builder
      .addCase(deleteApiRequest.fulfilled, (state, action) => {
        const id = action.payload
        state.requests = state.requests.filter(r => r.id !== id)
        if (state.activeRequestId === id) {
          state.activeRequestId = null
          state.activeRequest = null
          state.response = null
        }
      })

    // sendApiRequest
    builder
      .addCase(sendApiRequest.pending, (state) => {
        state.isSending = true
        state.error = null
      })
      .addCase(sendApiRequest.fulfilled, (state, action) => {
        state.isSending = false
        state.response = action.payload
      })
      .addCase(sendApiRequest.rejected, (state, action) => {
        state.isSending = false
        state.error = action.error.message ?? 'Request failed'
      })

    // fetchApiHistory
    builder
      .addCase(fetchApiHistory.fulfilled, (state, action) => {
        state.history = action.payload
      })

    // clearApiHistory
    builder
      .addCase(clearApiHistory.fulfilled, (state) => {
        state.history = []
      })
  }
})

export const { setActiveRequest, updateDraft, newRequest, clearResponse, loadHistoryEntry } = apiSlice.actions
export default apiSlice.reducer
