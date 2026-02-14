import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'
import type { ScriptParameter } from '@/lib/types'

export interface Tag {
    id: string
    name: string
    color: string
}

export interface Script {
    id: string
    name: string
    filename: string
    description?: string
    content?: string
    language?: string
    interpreter?: string | null
    parameters?: ScriptParameter[]
    created_at: string
    updated_at: string
    last_run?: string
    webhook_token?: string
    schedule_cron?: string
    schedule_enabled?: boolean
    collection_id?: string | null
    // GitHub Gist
    gist_id?: string
    gist_url?: string
    sync_to_gist?: boolean
    // Tags
    tags?: Tag[]
}

export type { ScriptParameter }

export interface Build {
    id: string
    script_id: string
    status: 'pending' | 'running' | 'success' | 'failure'
    started_at: string
    completed_at?: string
    triggered_by: string
}

export interface Collection {
    id: string;
    name: string;
    description?: string;
    script_count?: number;
    created_at: string;
}

export interface ScriptTemplate {
    id: string
    name: string
    description: string
    category: string
    language: string
    interpreter?: string | null
    content: string
    parameters: ScriptParameter[]
    is_built_in: boolean
    created_at: string
}

interface ScriptsState {
    items: Script[];
    collections: Collection[];
    templates: ScriptTemplate[];
    templatesStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
    allTags: Tag[];
    activeScriptId: string | null;
    activeScriptContent: string;
    builds: Build[];
    currentBuildOutput: string;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    contentStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
    runStatus: 'idle' | 'running';
    error: string | null;
    saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
    schedule: {
        cron: string;
        enabled: boolean;
        nextRun: string | null;
        status: 'idle' | 'loading' | 'saved' | 'failed';
    };
}

const initialState: ScriptsState = {
    items: [],
    collections: [],
    templates: [],
    templatesStatus: 'idle',
    allTags: [],
    activeScriptId: null,
    activeScriptContent: '',
    builds: [],
    currentBuildOutput: '',
    status: 'idle',
    contentStatus: 'idle',
    runStatus: 'idle',
    error: null,
    saveStatus: 'idle',
    schedule: {
        cron: '',
        enabled: false,
        nextRun: null,
        status: 'idle'
    }
}

export const fetchScripts = createAsyncThunk('scripts/fetchScripts', async () => {
    const response = await axios.get('/api/scripts')
    return response.data
})

export const fetchScriptContent = createAsyncThunk('scripts/fetchScriptContent', async (id: string) => {
    const response = await axios.get(`/api/scripts/${id}`)
    return response.data
})

export const createScript = createAsyncThunk('scripts/createScript', async (payload: string | {
    name: string
    syncToGist?: boolean
    content?: string
    language?: string
    interpreter?: string | null
    parameters?: ScriptParameter[]
}) => {
    const name = typeof payload === 'string' ? payload : payload.name
    const syncToGist = typeof payload === 'string' ? undefined : payload.syncToGist
    const content = typeof payload === 'string' ? undefined : payload.content
    const language = typeof payload === 'string' ? undefined : payload.language
    const interpreter = typeof payload === 'string' ? undefined : payload.interpreter
    const parameters = typeof payload === 'string' ? undefined : payload.parameters
    const response = await axios.post('/api/scripts', {
        name,
        content: content ?? '# New script\nprint("Hello World")',
        sync_to_gist: syncToGist,
        language,
        interpreter,
        parameters,
    })
    return response.data
})

export const fetchTemplates = createAsyncThunk('scripts/fetchTemplates', async () => {
    const response = await axios.get('/api/templates')
    return response.data
})

export const saveAsTemplate = createAsyncThunk(
    'scripts/saveAsTemplate',
    async (payload: {
        name: string
        description: string
        category: string
        language: string
        interpreter?: string | null
        content: string
        parameters?: ScriptParameter[]
    }, { rejectWithValue }) => {
        try {
            const response = await axios.post('/api/templates', payload)
            return response.data
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: unknown } }
            return rejectWithValue(axiosErr.response?.data ?? { error: 'Unknown error' })
        }
    }
)

export const deleteTemplate = createAsyncThunk('scripts/deleteTemplate', async (id: string) => {
    await axios.delete(`/api/templates/${id}`)
    return id
})

export const saveScript = createAsyncThunk('scripts/saveScript', async (data: { id: string; name: string; content: string; sync_to_gist?: boolean; language?: string; interpreter?: string | null; parameters?: ScriptParameter[] }) => {
    const response = await axios.post('/api/scripts', data)
    return response.data
})

export const runScript = createAsyncThunk('scripts/runScript', async ({ id, paramValues }: { id: string; paramValues?: Record<string, string> }) => {
    const response = await axios.post(`/api/scripts/${id}/run`, { paramValues })
    return response.data
})

export const fetchBuilds = createAsyncThunk('scripts/fetchBuilds', async (scriptId: string) => {
    const response = await axios.get(`/api/builds/${scriptId}`)
    return response.data
})

export const fetchBuildOutput = createAsyncThunk('scripts/fetchBuildOutput', async ({ scriptId, buildId }: { scriptId: string; buildId: string }) => {
    const response = await axios.get(`/api/builds/output/${scriptId}/${buildId}`)
    return response.data.output
})

export const regenerateWebhook = createAsyncThunk('scripts/regenerateWebhook', async (scriptId: string) => {
    const response = await axios.post(`/api/scripts/${scriptId}/webhook/regenerate`)
    return { scriptId, token: response.data.webhook_token }
})

export const fetchSchedule = createAsyncThunk('scripts/fetchSchedule', async (scriptId: string) => {
    const response = await axios.get(`/api/scripts/${scriptId}/schedule`)
    return response.data
})

export const saveSchedule = createAsyncThunk('scripts/saveSchedule', async (data: { scriptId: string; cron: string; enabled: boolean }) => {
    const response = await axios.put(`/api/scripts/${data.scriptId}/schedule`, { cron: data.cron, enabled: data.enabled })
    return response.data
})

export const deleteSchedule = createAsyncThunk('scripts/deleteSchedule', async (scriptId: string) => {
    await axios.delete(`/api/scripts/${scriptId}/schedule`)
    return null
})

export const forceSyncGist = createAsyncThunk('scripts/forceSyncGist', async (scriptId: string) => {
    const response = await axios.post(`/api/scripts/${scriptId}/gist/sync`)
    return { scriptId, ...response.data }
})

export const deleteGist = createAsyncThunk('scripts/deleteGist', async (scriptId: string) => {
    await axios.delete(`/api/scripts/${scriptId}/gist`)
    return scriptId
})

// --- Collection Thunks ---

export const fetchCollections = createAsyncThunk('scripts/fetchCollections', async () => {
    const response = await axios.get('/api/collections')
    return response.data
})

export const createCollection = createAsyncThunk('scripts/createCollection', async (name: string) => {
    const response = await axios.post('/api/collections', { name })
    return response.data
})

export const deleteCollection = createAsyncThunk('scripts/deleteCollection', async (id: string) => {
    await axios.delete(`/api/collections/${id}`)
    return id
})

export const moveScript = createAsyncThunk('scripts/moveScript', async ({ scriptId, collectionId }: { scriptId: string, collectionId: string | null }) => {
    const response = await axios.put(`/api/scripts/${scriptId}/move`, { collection_id: collectionId })
    return { scriptId, collectionId: response.data.collection_id }
})

// --- Tag Thunks ---

export const fetchAllTags = createAsyncThunk('scripts/fetchAllTags', async () => {
    const response = await axios.get('/api/tags')
    return response.data as Tag[]
})

export const addTagToScript = createAsyncThunk('scripts/addTagToScript', async ({ scriptId, name, color }: { scriptId: string; name: string; color?: string }) => {
    const response = await axios.post(`/api/scripts/${scriptId}/tags`, { name, color })
    return { scriptId, tag: response.data as Tag }
})

export const removeTagFromScript = createAsyncThunk('scripts/removeTagFromScript', async ({ scriptId, tagId }: { scriptId: string; tagId: string }) => {
    await axios.delete(`/api/scripts/${scriptId}/tags?tagId=${tagId}`)
    return { scriptId, tagId }
})

const scriptsSlice = createSlice({
    name: 'scripts',
    initialState,
    reducers: {
        setActiveScript(state, action: PayloadAction<string | null>) {
            state.activeScriptId = action.payload
            state.contentStatus = 'idle'
            state.currentBuildOutput = ''
            state.builds = []
            state.schedule = { cron: '', enabled: false, nextRun: null, status: 'idle' }
        },
        updateActiveScriptContent(state, action: PayloadAction<string>) {
            state.activeScriptContent = action.payload
        },
        appendBuildOutput(state, action: PayloadAction<string>) {
            state.currentBuildOutput += action.payload
        },
        clearBuildOutput(state) {
            state.currentBuildOutput = ''
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchScripts.pending, (state) => {
                state.status = 'loading'
            })
            .addCase(fetchScripts.fulfilled, (state, action) => {
                state.items = action.payload
                state.status = 'succeeded'
            })
            .addCase(fetchScripts.rejected, (state, action) => {
                state.status = 'failed'
                state.error = action.error.message || 'Failed to fetch scripts'
            })
            .addCase(fetchScriptContent.pending, (state) => {
                state.contentStatus = 'loading'
            })
            .addCase(fetchScriptContent.fulfilled, (state, action) => {
                state.activeScriptContent = action.payload.content
                state.contentStatus = 'succeeded'
                // Merge parameters back into the items array so the UI can read them
                if (action.payload.parameters) {
                    const idx = state.items.findIndex(s => s.id === state.activeScriptId)
                    if (idx !== -1) {
                        state.items[idx].parameters = action.payload.parameters
                    }
                }
            })
            .addCase(fetchScriptContent.rejected, (state) => {
                state.contentStatus = 'failed'
            })
            .addCase(runScript.pending, (state) => {
                state.runStatus = 'running'
            })
            .addCase(runScript.fulfilled, (state) => {
                state.runStatus = 'idle'
            })
            .addCase(runScript.rejected, (state) => {
                state.runStatus = 'idle'
            })
            .addCase(createScript.fulfilled, (state, action) => {
                state.items.push(action.payload)
                state.activeScriptId = action.payload.id
                state.activeScriptContent = '# New script\nprint("Hello World")'
            })
            .addCase(saveScript.pending, (state) => {
                state.saveStatus = 'saving'
            })
            .addCase(saveScript.fulfilled, (state, action) => {
                state.saveStatus = 'saved'
                const idx = state.items.findIndex(s => s.id === action.payload.id)
                if (idx !== -1) {
                    state.items[idx] = { ...state.items[idx], ...action.payload }
                } else {
                    state.items.push(action.payload)
                    state.activeScriptId = action.payload.id
                }
            })
            .addCase(saveScript.rejected, (state) => {
                state.saveStatus = 'failed'
            })
            .addCase(fetchBuilds.fulfilled, (state, action) => {
                state.builds = action.payload
            })
            .addCase(fetchBuildOutput.fulfilled, (state, action) => {
                state.currentBuildOutput = action.payload
            })
            .addCase(regenerateWebhook.fulfilled, (state, action) => {
                const script = state.items.find(s => s.id === action.payload.scriptId)
                if (script) {
                    script.webhook_token = action.payload.token
                }
            })
            .addCase(fetchSchedule.fulfilled, (state, action) => {
                state.schedule.cron = action.payload.schedule_cron || ''
                state.schedule.enabled = action.payload.schedule_enabled
                state.schedule.nextRun = action.payload.next_run_time
                state.schedule.status = 'idle'
            })
            .addCase(saveSchedule.fulfilled, (state, action) => {
                state.schedule.cron = action.payload.schedule_cron || ''
                state.schedule.enabled = action.payload.schedule_enabled
                state.schedule.nextRun = action.payload.next_run_time
                state.schedule.status = 'saved'
            })
            .addCase(deleteSchedule.fulfilled, (state) => {
                state.schedule.cron = ''
                state.schedule.enabled = false
                state.schedule.nextRun = null
                state.schedule.status = 'idle'
            })
            .addCase(fetchCollections.fulfilled, (state, action) => {
                state.collections = action.payload
            })
            .addCase(createCollection.fulfilled, (state, action) => {
                state.collections.push(action.payload)
            })
            .addCase(deleteCollection.fulfilled, (state, action) => {
                state.collections = state.collections.filter(c => c.id !== action.payload)
                state.items.forEach(script => {
                    if (script.collection_id === action.payload) {
                        script.collection_id = null
                    }
                })
            })
            .addCase(moveScript.fulfilled, (state, action) => {
                const script = state.items.find(s => s.id === action.payload.scriptId)
                if (script) {
                    script.collection_id = action.payload.collectionId
                }
            })
            .addCase(forceSyncGist.fulfilled, (state, action) => {
                const script = state.items.find(s => s.id === action.payload.scriptId)
                if (script) {
                    script.gist_id = action.payload.gist_id
                    script.gist_url = action.payload.gist_url
                    script.sync_to_gist = true
                }
            })
            .addCase(deleteGist.fulfilled, (state, action) => {
                const script = state.items.find(s => s.id === action.payload)
                if (script) {
                    script.gist_id = undefined
                    script.gist_url = undefined
                    script.sync_to_gist = false
                }
            })
            .addCase(fetchTemplates.pending, (state) => {
                state.templatesStatus = 'loading'
            })
            .addCase(fetchTemplates.fulfilled, (state, action) => {
                state.templates = action.payload
                state.templatesStatus = 'succeeded'
            })
            .addCase(fetchTemplates.rejected, (state) => {
                state.templatesStatus = 'failed'
            })
            .addCase(saveAsTemplate.fulfilled, (state, action) => {
                state.templates.push(action.payload)
            })
            .addCase(deleteTemplate.fulfilled, (state, action) => {
                state.templates = state.templates.filter(t => t.id !== action.payload)
            })
            .addCase(fetchAllTags.fulfilled, (state, action) => {
                state.allTags = action.payload
            })
            .addCase(addTagToScript.fulfilled, (state, action) => {
                const { scriptId, tag } = action.payload
                const script = state.items.find(s => s.id === scriptId)
                if (script) {
                    if (!script.tags) script.tags = []
                    if (!script.tags.find(t => t.id === tag.id)) {
                        script.tags.push(tag)
                    }
                }
                // Also add to allTags if not present
                if (!state.allTags.find(t => t.id === tag.id)) {
                    state.allTags.push(tag)
                }
            })
            .addCase(removeTagFromScript.fulfilled, (state, action) => {
                const { scriptId, tagId } = action.payload
                const script = state.items.find(s => s.id === scriptId)
                if (script && script.tags) {
                    script.tags = script.tags.filter(t => t.id !== tagId)
                }
            })
    }
})

export const { setActiveScript, updateActiveScriptContent, appendBuildOutput, clearBuildOutput } = scriptsSlice.actions
export default scriptsSlice.reducer
