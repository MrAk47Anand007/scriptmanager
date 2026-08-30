import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import axios from 'axios'
import type { GitAction, GitBranches, GitCommitLog, GitDiffFile, GitStatus } from '@/lib/git/types'
import { runGitActionRuntime } from '@/lib/gitRuntimeClient'

interface GitState {
  projectId: string | null
  status: GitStatus | null
  branches: GitBranches | null
  diff: GitDiffFile[]
  commitLogs: GitCommitLog[]
  selectedPath: string | null
  activeTab: 'changes' | 'history'
  pending: string | null
  approvalId: string | null
  error: string | null
}

const initialState: GitState = {
  projectId: null,
  status: null,
  branches: null,
  diff: [],
  commitLogs: [],
  selectedPath: null,
  activeTab: 'changes',
  pending: null,
  approvalId: null,
  error: null,
}

export const runGitAction = createAsyncThunk(
  'git/run',
  async ({ projectId, action }: { projectId: string; action: GitAction }) => {
    const response = await runGitActionRuntime(projectId, action)
    return { action: action.action, response }
  }
)

export const probeGitRepo = createAsyncThunk(
  'git/probe',
  async ({ url, token }: { url: string; token?: string }) => {
    const response = await axios.post('/api/git/probe', { url, token })
    return response.data
  }
)

export const cloneGitRepo = createAsyncThunk(
  'git/clone',
  async (payload: { url: string; targetPath: string; token?: string; projectName?: string; branch?: string }) => {
    const response = await axios.post('/api/git/clone', payload)
    return response.data
  }
)

const slice = createSlice({
  name: 'git',
  initialState,
  reducers: {
    selectGitProject(state, action: PayloadAction<string | null>) {
      state.projectId = action.payload
      state.status = null
      state.branches = null
      state.diff = []
      state.commitLogs = []
      state.selectedPath = null
      state.error = null
    },
    selectDiffPath(state, action: PayloadAction<string | null>) {
      state.selectedPath = action.payload
    },
    setGitTab(state, action: PayloadAction<'changes' | 'history'>) {
      state.activeTab = action.payload
    },
    setGitResult(state, action: PayloadAction<{ action: string; data: unknown }>) {
      if (action.payload.action === 'status') state.status = action.payload.data as GitStatus
      if (action.payload.action === 'branches') state.branches = action.payload.data as GitBranches
      if (action.payload.action === 'diff') state.diff = action.payload.data as GitDiffFile[]
      if (action.payload.action === 'log') state.commitLogs = action.payload.data as GitCommitLog[]
    },
  },
  extraReducers: (builder) =>
    builder
      .addCase(runGitAction.pending, (state, action) => {
        state.pending = String(action.meta.arg.action.action)
        state.error = null
        state.approvalId = null
      })
      .addCase(runGitAction.fulfilled, (state, action) => {
        state.pending = null
        if (action.payload.response.kind === 'approval') {
          state.approvalId = action.payload.response.approval.id
          return
        }
        slice.caseReducers.setGitResult(state, {
          type: 'git/setGitResult',
          payload: { action: action.payload.action, data: action.payload.response.data },
        })
      })
      .addCase(runGitAction.rejected, (state, action) => {
        state.pending = null
        state.error = action.error.message ?? 'Git operation failed'
      }),
})

export const { selectGitProject, selectDiffPath, setGitTab, setGitResult } = slice.actions
export default slice.reducer
