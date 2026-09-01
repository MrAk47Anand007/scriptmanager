import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import {
  clearApiHistoryRuntime,
  deleteApiCollectionRuntime,
  deleteApiEnvironmentRuntime,
  deleteApiRequestRuntime,
  listApiCollectionRunsRuntime,
  listApiCollectionsRuntime,
  listApiEnvironmentsRuntime,
  listApiHistoryRuntime,
  listApiRequestsRuntime,
  readApiGlobalsRuntime,
  runApiCollectionRuntime,
  saveApiCollectionRuntime,
  saveApiEnvironmentRuntime,
  saveApiGlobalsRuntime,
  saveApiRequestRuntime,
  sendApiRequestRuntime,
} from '@/lib/apiRuntimeClient'
import {
  materializeApiRequest,
  parseVariableRows,
  parseResponseMappingRows,
  stringifyResponseMappingRows,
  stringifyVariableRows,
  type ApiVariableRow,
  type ApiResponseMappingRow,
  type MaterializableApiRequestDraft,
} from '@/lib/apiRequestMaterialization'

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
  variables: string
  request_count: number
  created_at: string
  updated_at: string
}

export interface ApiEnvironment {
  id: string
  name: string
  variables: string
  created_at: string
  updated_at: string
}

export interface ApiRequest {
  id: string
  name: string
  method: string
  url: string
  headers: string
  query_params: string
  variables: string
  request_options: string
  pre_request_script: string
  test_script: string
  response_mappings: string
  body_type: string
  body: string
  auth_type: string
  auth_config: string
  collection_id: string | null
  created_at: string
  updated_at: string
}

export interface ApiRequestDraft extends MaterializableApiRequestDraft {
  id?: string
  headers: KeyValueRow[]
  queryParams: KeyValueRow[]
  variables: KeyValueRow[]
  responseMappings: ApiResponseMappingRow[]
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
  cookieJarHost?: string | null
  consoleLogs?: Array<{ phase: 'pre-request' | 'test'; level: 'log' | 'warn' | 'error'; message: string }>
  testResults?: Array<{ name: string; passed: boolean; message: string }>
  mappingResults?: Array<{ variableName: string; sourcePath: string; targetScope: string; applied: boolean; value?: string; reason?: string }>
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
  console_logs: string
  test_results: string
  created_at: string
}

export interface ApiCollectionRun {
  id: string
  collection_id: string
  collection_name: string
  environment_id: string | null
  environment_name: string | null
  status: string
  total_requests: number
  passed_requests: number
  failed_requests: number
  results: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
}

interface ApiState {
  collections: ApiCollection[]
  environments: ApiEnvironment[]
  globalVariables: KeyValueRow[]
  activeEnvironmentId: string | null
  requests: ApiRequest[]
  activeRequestId: string | null
  activeRequest: ApiRequestDraft | null
  response: ApiResponse | null
  history: ApiHistoryEntry[]
  collectionRuns: ApiCollectionRun[]
  activeCollectionRun: ApiCollectionRun | null
  isLoading: boolean
  isSending: boolean
  isRunningCollection: boolean
  error: string | null
}

function blankRow(): KeyValueRow {
  return { id: uuidv4(), key: '', value: '', enabled: true }
}

function ensureRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.length > 0 ? rows : [blankRow()]
}

function toClientRows(rows: ApiVariableRow[]): KeyValueRow[] {
  return ensureRows(rows.map((row) => ({
    id: row.id ?? uuidv4(),
    key: row.key ?? '',
    value: row.value ?? '',
    enabled: row.enabled ?? true,
  })))
}

function blankDraft(): ApiRequestDraft {
  return {
    name: 'Untitled Request',
    method: 'GET',
    url: '',
    headers: [blankRow()],
    queryParams: [blankRow()],
    variables: [blankRow()],
    responseMappings: [],
    bodyType: 'none',
    body: '',
    authType: 'none',
    authConfig: {},
    requestOptions: { useCookieJar: false },
    preRequestScript: '',
    testScript: '',
    collectionId: null,
  }
}

function requestToDraft(request: ApiRequest): ApiRequestDraft {
  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: toClientRows(parseVariableRows(request.headers)),
    queryParams: toClientRows(parseVariableRows(request.query_params)),
    variables: toClientRows(parseVariableRows(request.variables)),
    requestOptions: (() => { try { return JSON.parse(request.request_options) } catch { return { useCookieJar: false } } })(),
    preRequestScript: request.pre_request_script ?? '',
    testScript: request.test_script ?? '',
    responseMappings: parseResponseMappingRows(request.response_mappings),
    bodyType: request.body_type as ApiRequestDraft['bodyType'],
    body: request.body,
    authType: request.auth_type as ApiRequestDraft['authType'],
    authConfig: (() => { try { return JSON.parse(request.auth_config) } catch { return {} } })(),
    collectionId: request.collection_id,
  }
}

function draftToApiPayload(draft: ApiRequestDraft) {
  return {
    name: draft.name,
    method: draft.method,
    url: draft.url,
    headers: stringifyVariableRows(draft.headers),
    query_params: stringifyVariableRows(draft.queryParams),
    variables: stringifyVariableRows(draft.variables),
    request_options: JSON.stringify(draft.requestOptions ?? {}),
    pre_request_script: draft.preRequestScript ?? '',
    test_script: draft.testScript ?? '',
    response_mappings: stringifyResponseMappingRows(draft.responseMappings ?? []),
    body_type: draft.bodyType,
    body: draft.body,
    auth_type: draft.authType,
    auth_config: JSON.stringify(draft.authConfig),
    collection_id: draft.collectionId ?? null,
  }
}

export const fetchApiCollections = createAsyncThunk('api/fetchCollections', async () => {
  return await listApiCollectionsRuntime() as ApiCollection[]
})

export const fetchApiRequests = createAsyncThunk('api/fetchRequests', async () => {
  return await listApiRequestsRuntime() as ApiRequest[]
})

export const fetchApiEnvironments = createAsyncThunk('api/fetchEnvironments', async () => {
  return await listApiEnvironmentsRuntime() as ApiEnvironment[]
})

export const saveApiEnvironment = createAsyncThunk(
  'api/saveEnvironment',
  async ({ id, name, variables }: { id?: string; name: string; variables: KeyValueRow[] }) => {
    const payload = { name, variables: stringifyVariableRows(variables) }
    return await saveApiEnvironmentRuntime({ ...(id ? { id } : {}), ...payload }) as ApiEnvironment
  }
)

export const deleteApiEnvironment = createAsyncThunk(
  'api/deleteEnvironment',
  async (id: string) => {
    return await deleteApiEnvironmentRuntime(id)
  }
)

export const fetchApiGlobals = createAsyncThunk('api/fetchGlobals', async () => {
  const data = await readApiGlobalsRuntime() as { variables: string }
  return toClientRows(parseVariableRows(data.variables))
})

export const saveApiGlobals = createAsyncThunk(
  'api/saveGlobals',
  async (variables: KeyValueRow[]) => {
    const data = await saveApiGlobalsRuntime(stringifyVariableRows(variables)) as { variables: string }
    return toClientRows(parseVariableRows(data.variables))
  }
)

export const createApiCollection = createAsyncThunk(
  'api/createCollection',
  async ({ name, description, variables }: { name: string; description?: string; variables?: KeyValueRow[] }) => {
    return await saveApiCollectionRuntime({
      name,
      description: description ?? '',
      variables: stringifyVariableRows(variables ?? []),
    }) as ApiCollection
  }
)

export const updateApiCollection = createAsyncThunk(
  'api/updateCollection',
  async ({ id, name, description, variables }: { id: string; name: string; description?: string; variables?: KeyValueRow[] }) => {
    return await saveApiCollectionRuntime({
      id,
      name,
      description: description ?? '',
      variables: stringifyVariableRows(variables ?? []),
    }) as ApiCollection
  }
)

export const deleteApiCollection = createAsyncThunk(
  'api/deleteCollection',
  async (id: string) => {
    return await deleteApiCollectionRuntime(id)
  }
)

export const saveApiRequest = createAsyncThunk(
  'api/saveRequest',
  async (draft: ApiRequestDraft) => {
    const payload = draftToApiPayload(draft)
    return await saveApiRequestRuntime({ ...(draft.id ? { id: draft.id } : {}), ...payload }) as ApiRequest
  }
)

export const deleteApiRequest = createAsyncThunk(
  'api/deleteRequest',
  async (id: string) => {
    return await deleteApiRequestRuntime(id)
  }
)

export const sendApiRequest = createAsyncThunk<
  { response: ApiResponse; refreshedRequest?: ApiRequest; refreshedGlobals?: KeyValueRow[]; refreshedEnvironments?: ApiEnvironment[] },
  ApiRequestDraft,
  { state: { api: ApiState }; rejectValue: { message: string; unresolved?: string[] } }
>(
  'api/sendRequest',
  async (draft, { getState, rejectWithValue }) => {
    const state = getState().api
    const environmentVariables = state.activeEnvironmentId
      ? toClientRows(parseVariableRows(state.environments.find((item) => item.id === state.activeEnvironmentId)?.variables))
      : []
    const collectionVariables = draft.collectionId
      ? toClientRows(parseVariableRows(state.collections.find((item) => item.id === draft.collectionId)?.variables))
      : []
    const preview = materializeApiRequest(draft, {
      global: state.globalVariables,
      environment: environmentVariables,
      collection: collectionVariables,
    })

    if (preview.unresolvedVariables.length > 0) {
      return rejectWithValue({
        message: `Missing variables: ${preview.unresolvedVariables.join(', ')}`,
        unresolved: preview.unresolvedVariables,
      })
    }

    try {
      const responseData = await sendApiRequestRuntime({
        requestId: draft.id ?? null,
        collectionId: draft.collectionId ?? null,
        environmentId: state.activeEnvironmentId,
        method: draft.method,
        url: draft.url,
        headers: draft.headers,
        queryParams: draft.queryParams,
        variables: draft.variables,
        requestOptions: draft.requestOptions ?? {},
        preRequestScript: draft.preRequestScript ?? '',
        testScript: draft.testScript ?? '',
        responseMappings: draft.responseMappings ?? [],
        bodyType: draft.bodyType,
        body: draft.body,
        authType: draft.authType,
        authConfig: draft.authConfig,
      })

      if ('ok' in (responseData as Record<string, unknown>) && (responseData as { ok?: boolean }).ok === false) {
        const errorResponse = responseData as { error?: string; unresolved_variables?: string[] }
        return rejectWithValue({
          message: errorResponse.error ?? 'Request failed',
          unresolved: errorResponse.unresolved_variables,
        })
      }

      const desktopResult = responseData as {
        response: ApiResponse
        refreshedRequest?: ApiRequest
        refreshedGlobals?: { variables: string }
        refreshedEnvironments?: ApiEnvironment[]
      }

      const directResponse = responseData as Partial<ApiResponse>
      const normalizedResponse = desktopResult.response ?? (
        typeof directResponse.status === 'number' && typeof directResponse.body === 'string'
          ? {
            status: directResponse.status,
            statusText: directResponse.statusText ?? '',
            headers: directResponse.headers ?? {},
            body: directResponse.body,
            duration: directResponse.duration ?? 0,
            size: directResponse.size ?? 0,
            error: directResponse.error,
            truncated: directResponse.truncated,
            cookieJarHost: directResponse.cookieJarHost ?? null,
            consoleLogs: directResponse.consoleLogs ?? [],
            testResults: directResponse.testResults ?? [],
            mappingResults: directResponse.mappingResults ?? [],
            timestamp: directResponse.timestamp ?? Date.now(),
          } satisfies ApiResponse
          : undefined
      )

      if (!normalizedResponse) {
        return rejectWithValue({
          message: 'Request completed but no response payload was returned',
        })
      }

      return {
        response: normalizedResponse,
        refreshedRequest: desktopResult.refreshedRequest,
        refreshedGlobals: desktopResult.refreshedGlobals
          ? toClientRows(parseVariableRows(desktopResult.refreshedGlobals.variables))
          : undefined,
        refreshedEnvironments: desktopResult.refreshedEnvironments,
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : error.message
        const unresolved = Array.isArray(error.response?.data?.unresolved_variables)
          ? error.response?.data.unresolved_variables as string[]
          : undefined
        return rejectWithValue({ message, unresolved })
      }
      throw error
    }
  }
)

export const fetchApiHistory = createAsyncThunk('api/fetchHistory', async () => {
  return await listApiHistoryRuntime() as ApiHistoryEntry[]
})

export const fetchApiCollectionRuns = createAsyncThunk('api/fetchCollectionRuns', async () => {
  return await listApiCollectionRunsRuntime() as ApiCollectionRun[]
})

export const runApiCollection = createAsyncThunk<
  ApiCollectionRun,
  { collectionId: string; environmentId: string | null }
>(
  'api/runCollection',
  async ({ collectionId, environmentId }) => {
    return await runApiCollectionRuntime({ collectionId, environmentId }) as ApiCollectionRun
  }
)

export const clearApiHistory = createAsyncThunk('api/clearHistory', async () => {
  await clearApiHistoryRuntime()
})

const initialState: ApiState = {
  collections: [],
  environments: [],
  globalVariables: [blankRow()],
  activeEnvironmentId: null,
  requests: [],
  activeRequestId: null,
  activeRequest: null,
  response: null,
  history: [],
  collectionRuns: [],
  activeCollectionRun: null,
  isLoading: false,
  isSending: false,
  isRunningCollection: false,
  error: null,
}

const apiSlice = createSlice({
  name: 'api',
  initialState,
  reducers: {
    setActiveRequest(state, action: PayloadAction<string>) {
      const request = state.requests.find((item) => item.id === action.payload)
      if (!request) return
      state.activeRequestId = request.id
      state.activeRequest = requestToDraft(request)
      state.response = null
    },
    newRequest(state, action: PayloadAction<Partial<ApiRequestDraft> | undefined>) {
      state.activeRequestId = null
      state.activeRequest = { ...blankDraft(), ...(action.payload ?? {}) }
      state.response = null
    },
    clearResponse(state) {
      state.response = null
    },
    closeActiveRequestEditor(state) {
      state.activeRequestId = null
      state.activeRequest = null
      state.response = null
    },
    setActiveCollectionRun(state, action: PayloadAction<ApiCollectionRun | null>) {
      state.activeCollectionRun = action.payload
    },
    setActiveEnvironment(state, action: PayloadAction<string | null>) {
      state.activeEnvironmentId = action.payload
    },
    loadHistoryEntry(state, action: PayloadAction<ApiHistoryEntry>) {
      const entry = action.payload
      let headers: KeyValueRow[] = []

      try {
        const parsed = JSON.parse(entry.request_headers) as Record<string, string>
        headers = Object.entries(parsed).map(([key, value]) => ({
          id: uuidv4(),
          key,
          value,
          enabled: true,
        }))
      } catch {
        headers = []
      }

      state.activeRequestId = null
      state.activeRequest = {
        name: `${entry.method} ${entry.url}`,
        method: entry.method,
        url: entry.url,
        headers: ensureRows(headers),
        queryParams: [blankRow()],
        variables: [blankRow()],
        responseMappings: [],
        bodyType: 'none',
        body: entry.request_body ?? '',
        authType: 'none',
        authConfig: {},
        requestOptions: { useCookieJar: false },
        preRequestScript: '',
        testScript: '',
        collectionId: null,
      }
      state.response = null
      state.activeCollectionRun = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchApiCollections.pending, (state) => {
        state.isLoading = true
      })
      .addCase(fetchApiCollections.fulfilled, (state, action) => {
        state.isLoading = false
        state.collections = action.payload
      })
      .addCase(fetchApiCollections.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message ?? 'Failed to fetch collections'
      })

    builder
      .addCase(fetchApiRequests.pending, (state) => {
        state.isLoading = true
      })
      .addCase(fetchApiRequests.fulfilled, (state, action) => {
        state.isLoading = false
        state.requests = action.payload
      })
      .addCase(fetchApiRequests.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.error.message ?? 'Failed to fetch requests'
      })

    builder
      .addCase(fetchApiEnvironments.fulfilled, (state, action) => {
        state.environments = action.payload
        if (state.activeEnvironmentId && !state.environments.some((item) => item.id === state.activeEnvironmentId)) {
          state.activeEnvironmentId = null
        }
      })

    builder
      .addCase(saveApiEnvironment.fulfilled, (state, action) => {
        const index = state.environments.findIndex((item) => item.id === action.payload.id)
        if (index === -1) {
          state.environments.push(action.payload)
        } else {
          state.environments[index] = action.payload
        }
        state.environments.sort((a, b) => a.name.localeCompare(b.name))
        if (!state.activeEnvironmentId) {
          state.activeEnvironmentId = action.payload.id
        }
      })
      .addCase(deleteApiEnvironment.fulfilled, (state, action) => {
        state.environments = state.environments.filter((item) => item.id !== action.payload)
        if (state.activeEnvironmentId === action.payload) {
          state.activeEnvironmentId = null
        }
      })

    builder
      .addCase(fetchApiGlobals.fulfilled, (state, action) => {
        state.globalVariables = ensureRows(action.payload)
      })
      .addCase(saveApiGlobals.fulfilled, (state, action) => {
        state.globalVariables = ensureRows(action.payload)
      })

    builder
      .addCase(createApiCollection.fulfilled, (state, action) => {
        state.collections.push(action.payload)
        state.collections.sort((a, b) => a.name.localeCompare(b.name))
      })
      .addCase(updateApiCollection.fulfilled, (state, action) => {
        const index = state.collections.findIndex((item) => item.id === action.payload.id)
        if (index !== -1) {
          state.collections[index] = {
            ...state.collections[index],
            ...action.payload,
          }
          state.collections.sort((a, b) => a.name.localeCompare(b.name))
        }
      })
      .addCase(deleteApiCollection.fulfilled, (state, action) => {
        state.collections = state.collections.filter((item) => item.id !== action.payload)
        state.requests = state.requests.map((request) =>
          request.collection_id === action.payload ? { ...request, collection_id: null } : request
        )
        if (state.activeRequest?.collectionId === action.payload && state.activeRequest) {
          state.activeRequest.collectionId = null
        }
      })

    builder
      .addCase(saveApiRequest.fulfilled, (state, action) => {
        const saved = action.payload
        const index = state.requests.findIndex((item) => item.id === saved.id)
        if (index !== -1) {
          state.requests[index] = saved
        } else {
          state.requests.unshift(saved)
        }
        state.activeRequestId = saved.id
        state.activeRequest = requestToDraft(saved)
      })
      .addCase(deleteApiRequest.fulfilled, (state, action) => {
        const id = action.payload
        state.requests = state.requests.filter((item) => item.id !== id)
        if (state.activeRequestId === id) {
          state.activeRequestId = null
          state.activeRequest = null
          state.response = null
        }
      })

    builder
      .addCase(sendApiRequest.pending, (state) => {
        state.isSending = true
        state.error = null
      })
      .addCase(sendApiRequest.fulfilled, (state, action) => {
        state.isSending = false
        state.response = action.payload.response
        if (action.payload.refreshedGlobals) {
          state.globalVariables = ensureRows(action.payload.refreshedGlobals)
        }
        if (action.payload.refreshedEnvironments) {
          state.environments = action.payload.refreshedEnvironments
        }
        if (action.payload.refreshedRequest) {
          state.activeRequest = requestToDraft(action.payload.refreshedRequest)
          const index = state.requests.findIndex((item) => item.id === action.payload.refreshedRequest?.id)
          if (index !== -1) {
            state.requests[index] = action.payload.refreshedRequest
          }
        }
      })
      .addCase(sendApiRequest.rejected, (state, action) => {
        state.isSending = false
        const message = action.payload?.message ?? action.error.message ?? 'Request failed'
        state.error = message
        state.response = {
          status: 0,
          statusText: 'Request Failed',
          headers: {},
          body: '',
          duration: 0,
          size: 0,
          error: message,
          timestamp: Date.now(),
        }
      })

    builder
      .addCase(fetchApiHistory.fulfilled, (state, action) => {
        state.history = action.payload
      })
      .addCase(fetchApiCollectionRuns.fulfilled, (state, action) => {
        state.collectionRuns = action.payload
      })
      .addCase(runApiCollection.pending, (state) => {
        state.isRunningCollection = true
      })
      .addCase(runApiCollection.fulfilled, (state, action) => {
        state.isRunningCollection = false
        state.collectionRuns.unshift(action.payload)
        state.activeCollectionRun = action.payload
      })
      .addCase(runApiCollection.rejected, (state, action) => {
        state.isRunningCollection = false
        state.error = action.error.message ?? 'Failed to run collection'
      })
      .addCase(clearApiHistory.fulfilled, (state) => {
        state.history = []
      })
  },
})

export const {
  setActiveRequest,
  newRequest,
  clearResponse,
  closeActiveRequestEditor,
  setActiveCollectionRun,
  setActiveEnvironment,
  loadHistoryEntry,
} = apiSlice.actions

export default apiSlice.reducer
