import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'
import {
    assignCollectionToProjectRuntime,
    deleteProjectRuntime,
    deleteServerProfileRuntime,
    listAuditLogRuntime,
    listProjectsRuntime,
    listServerProfilesRuntime,
    rejectRemoteExecutionRuntime,
    saveProjectRuntime,
    saveServerProfileRuntime,
    startRemoteExecutionRuntime,
    testServerProfileConnectionRuntime,
    transferRemoteScriptRuntime,
    approveRemoteExecutionRuntime,
} from '@/lib/opsRuntimeClient'

export interface Project {
    id: string
    name: string
    description: string
    environment: 'development' | 'qa' | 'uat' | 'production'
    color: string
    repository_root: string | null
    default_branch: string
    remote_url: string | null
    workspace_policy: import('@/lib/git/types').WorkspacePolicy
    collection_ids: string[]
    created_at: string
    updated_at: string
}

export interface ServerProfile {
    id: string
    name: string
    host: string
    port: number
    username: string
    auth_method: 'password' | 'key'
    has_secret: boolean
    key_path: string | null
    project_id: string | null
    notes: string
    created_at: string
    updated_at: string
}

export interface RemoteExecutionRecord {
    id: string
    script_id: string
    profile_id: string
    script_name: string
    profile_name: string
    server_host: string
    status: 'pending_approval' | 'approved' | 'rejected' | 'running' | 'success' | 'failure'
    triggered_by: string
    approved_by: string | null
    remote_path: string | null
    exit_code: number | null
    log_output: string | null
    param_values: string
    requested_at: string
    approved_at: string | null
    started_at: string | null
    finished_at: string | null
    requires_approval?: boolean
}

interface OpsState {
    isModeActive: boolean

    // Phase 2: Projects
    projects: Project[]
    projectsStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
    activeProjectId: string | null

    // Phase 3: Server Profiles
    serverProfiles: ServerProfile[]
    serverProfilesStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
    selectedProfileId: string | null

    // Phase 4: Remote Execution
    remoteExecStatus: 'idle' | 'connecting' | 'running' | 'done' | 'error'
    remoteExecOutput: string
    connectionTestResult: { success: boolean; error?: string; latency_ms?: number } | null
    currentRemoteExecId: string | null
    requiresApproval: boolean
    pendingApprovalEnvironment: 'uat' | 'production' | null
    pendingApprovalRecord: RemoteExecutionRecord | null

    // Phase 5: Audit Trail
    auditLog: RemoteExecutionRecord[]
    auditLogTotal: number
    auditLogStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
}

const initialState: OpsState = {
    isModeActive: false,
    projects: [],
    projectsStatus: 'idle',
    activeProjectId: null,
    serverProfiles: [],
    serverProfilesStatus: 'idle',
    selectedProfileId: null,
    remoteExecStatus: 'idle',
    remoteExecOutput: '',
    connectionTestResult: null,
    currentRemoteExecId: null,
    requiresApproval: false,
    pendingApprovalEnvironment: null,
    pendingApprovalRecord: null,
    auditLog: [],
    auditLogTotal: 0,
    auditLogStatus: 'idle',
}

// --- Phase 2: Project Thunks ---

export const fetchProjects = createAsyncThunk('ops/fetchProjects', async () => {
    return await listProjectsRuntime() as Project[]
})

export const createProject = createAsyncThunk(
    'ops/createProject',
    async (payload: { name: string; description?: string; environment?: string; color?: string; repository_root?: string; default_branch?: string }) => {
        return await saveProjectRuntime(payload) as Project
    }
)

export const updateProject = createAsyncThunk(
    'ops/updateProject',
    async ({ id, ...fields }: { id: string; name?: string; description?: string; environment?: string; color?: string; repository_root?: string | null; default_branch?: string }) => {
        return await saveProjectRuntime({ id, ...fields }) as Project
    }
)

export const deleteProject = createAsyncThunk('ops/deleteProject', async (id: string) => {
    return await deleteProjectRuntime(id)
})

export const assignCollectionToProject = createAsyncThunk(
    'ops/assignCollectionToProject',
    async ({ collectionId, projectId }: { collectionId: string; projectId: string | null }) => {
        return await assignCollectionToProjectRuntime({ collectionId, projectId })
    }
)

// --- Phase 3: Server Profile Thunks ---

export const fetchServerProfiles = createAsyncThunk('ops/fetchServerProfiles', async () => {
    return await listServerProfilesRuntime() as ServerProfile[]
})

export const createServerProfile = createAsyncThunk(
    'ops/createServerProfile',
    async (payload: {
        name: string
        host: string
        port?: number
        username: string
        auth_method?: string
        secret?: string
        key_path?: string
        project_id?: string | null
        notes?: string
    }) => {
        return await saveServerProfileRuntime(payload) as ServerProfile
    }
)

export const updateServerProfile = createAsyncThunk(
    'ops/updateServerProfile',
    async ({ id, ...fields }: {
        id: string
        name?: string
        host?: string
        port?: number
        username?: string
        auth_method?: string
        secret?: string
        key_path?: string
        project_id?: string | null
        notes?: string
    }) => {
        return await saveServerProfileRuntime({ id, ...fields }) as ServerProfile
    }
)

export const deleteServerProfile = createAsyncThunk('ops/deleteServerProfile', async (id: string) => {
    return await deleteServerProfileRuntime(id)
})

// --- Phase 4: Remote Execution Thunks ---

export const testConnection = createAsyncThunk(
    'ops/testConnection',
    async (profileId: string) => {
        return await testServerProfileConnectionRuntime(profileId) as { success: boolean; latency_ms?: number; error?: string }
    }
)

export const transferScript = createAsyncThunk(
    'ops/transferScript',
    async (payload: { profileId: string; scriptId: string; remotePath: string; permissions?: string }) => {
        return await transferRemoteScriptRuntime(payload) as { success: boolean; remote_path: string; error?: string }
    }
)

export const startRemoteExec = createAsyncThunk(
    'ops/startRemoteExec',
    async (payload: { profileId: string; scriptId: string; remotePath?: string; paramValues?: Record<string, string> }) => {
        return await startRemoteExecutionRuntime(payload) as { remote_exec_id: string; requires_approval: boolean; environment: string }
    }
)

// --- Phase 5: Audit Thunks ---

export const fetchAuditLog = createAsyncThunk(
    'ops/fetchAuditLog',
    async (params?: { profileId?: string; scriptId?: string; limit?: number; offset?: number }) => {
        return await listAuditLogRuntime(params) as { total: number; executions: RemoteExecutionRecord[] }
    }
)

export const approveExecution = createAsyncThunk(
    'ops/approveExecution',
    async ({ id, approverName }: { id: string; approverName: string }) => {
        return await approveRemoteExecutionRuntime(id, approverName)
    }
)

export const rejectExecution = createAsyncThunk(
    'ops/rejectExecution',
    async (id: string) => {
        return await rejectRemoteExecutionRuntime(id)
    }
)

const opsSlice = createSlice({
    name: 'ops',
    initialState,
    reducers: {
        toggleOpsMode(state) {
            state.isModeActive = !state.isModeActive
        },
        setOpsMode(state, action: PayloadAction<boolean>) {
            state.isModeActive = action.payload
        },
        setActiveProjectId(state, action: PayloadAction<string | null>) {
            state.activeProjectId = action.payload
        },
        setSelectedProfile(state, action: PayloadAction<string | null>) {
            state.selectedProfileId = action.payload
        },
        appendRemoteExecOutput(state, action: PayloadAction<string>) {
            state.remoteExecOutput += action.payload
        },
        clearRemoteExecOutput(state) {
            state.remoteExecOutput = ''
        },
        setRemoteExecStatus(state, action: PayloadAction<OpsState['remoteExecStatus']>) {
            state.remoteExecStatus = action.payload
        },
        clearApprovalState(state) {
            state.requiresApproval = false
            state.pendingApprovalEnvironment = null
            state.pendingApprovalRecord = null
        },
    },
    extraReducers: (builder) => {
        // fetchProjects
        builder
            .addCase(fetchProjects.pending, (state) => { state.projectsStatus = 'loading' })
            .addCase(fetchProjects.fulfilled, (state, action) => {
                state.projectsStatus = 'succeeded'
                state.projects = action.payload
            })
            .addCase(fetchProjects.rejected, (state) => { state.projectsStatus = 'failed' })

        // createProject
        builder.addCase(createProject.fulfilled, (state, action) => {
            state.projects.push(action.payload)
        })

        // updateProject
        builder.addCase(updateProject.fulfilled, (state, action) => {
            const idx = state.projects.findIndex(p => p.id === action.payload.id)
            if (idx !== -1) state.projects[idx] = action.payload
        })

        // deleteProject
        builder.addCase(deleteProject.fulfilled, (state, action) => {
            state.projects = state.projects.filter(p => p.id !== action.payload)
            if (state.activeProjectId === action.payload) state.activeProjectId = null
        })

        // fetchServerProfiles
        builder
            .addCase(fetchServerProfiles.pending, (state) => { state.serverProfilesStatus = 'loading' })
            .addCase(fetchServerProfiles.fulfilled, (state, action) => {
                state.serverProfilesStatus = 'succeeded'
                state.serverProfiles = action.payload
            })
            .addCase(fetchServerProfiles.rejected, (state) => { state.serverProfilesStatus = 'failed' })

        // createServerProfile
        builder.addCase(createServerProfile.fulfilled, (state, action) => {
            state.serverProfiles.push(action.payload)
        })

        // updateServerProfile
        builder.addCase(updateServerProfile.fulfilled, (state, action) => {
            const idx = state.serverProfiles.findIndex(p => p.id === action.payload.id)
            if (idx !== -1) state.serverProfiles[idx] = action.payload
        })

        // deleteServerProfile
        builder.addCase(deleteServerProfile.fulfilled, (state, action) => {
            state.serverProfiles = state.serverProfiles.filter(p => p.id !== action.payload)
            if (state.selectedProfileId === action.payload) state.selectedProfileId = null
        })

        // testConnection
        builder
            .addCase(testConnection.pending, (state) => {
                state.connectionTestResult = null
                state.remoteExecStatus = 'connecting'
            })
            .addCase(testConnection.fulfilled, (state, action) => {
                state.connectionTestResult = action.payload
                state.remoteExecStatus = action.payload.success ? 'idle' : 'error'
            })
            .addCase(testConnection.rejected, (state) => {
                state.connectionTestResult = { success: false, error: 'Request failed' }
                state.remoteExecStatus = 'error'
            })

        // startRemoteExec
        builder
            .addCase(startRemoteExec.pending, (state) => {
                state.remoteExecStatus = 'running'
                state.remoteExecOutput = ''
                state.requiresApproval = false
                state.pendingApprovalEnvironment = null
                state.pendingApprovalRecord = null
            })
            .addCase(startRemoteExec.fulfilled, (state, action) => {
                state.currentRemoteExecId = action.payload.remote_exec_id
                state.requiresApproval = action.payload.requires_approval
                if (action.payload.requires_approval) {
                    state.remoteExecStatus = 'idle'
                    const env = action.payload.environment
                    state.pendingApprovalEnvironment = (env === 'production' || env === 'uat') ? env : null
                } else {
                    state.remoteExecStatus = 'running'
                }
            })
            .addCase(startRemoteExec.rejected, (state) => {
                state.remoteExecStatus = 'error'
            })

        // approveExecution
        builder.addCase(approveExecution.fulfilled, (state) => {
            state.requiresApproval = false
            state.pendingApprovalEnvironment = null
            state.pendingApprovalRecord = null
            state.remoteExecStatus = 'running'
        })

        // rejectExecution
        builder.addCase(rejectExecution.fulfilled, (state) => {
            state.requiresApproval = false
            state.pendingApprovalEnvironment = null
            state.pendingApprovalRecord = null
            state.currentRemoteExecId = null
            state.remoteExecStatus = 'idle'
        })

        // fetchAuditLog
        builder
            .addCase(fetchAuditLog.pending, (state) => { state.auditLogStatus = 'loading' })
            .addCase(fetchAuditLog.fulfilled, (state, action) => {
                state.auditLogStatus = 'succeeded'
                state.auditLog = action.payload.executions
                state.auditLogTotal = action.payload.total
            })
            .addCase(fetchAuditLog.rejected, (state) => { state.auditLogStatus = 'failed' })
    },
})

export const {
    toggleOpsMode, setOpsMode, setActiveProjectId, setSelectedProfile,
    appendRemoteExecOutput, clearRemoteExecOutput, setRemoteExecStatus,
    clearApprovalState,
} = opsSlice.actions
export default opsSlice.reducer
