import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { GitBranches, GitDiffFile, GitStatus } from '@/lib/git/types'
import type { GitAction } from '@/lib/git/types'
import { runGitActionRuntime } from '@/lib/gitRuntimeClient'

interface GitState { projectId: string | null; status: GitStatus | null; branches: GitBranches | null; diff: GitDiffFile[]; selectedPath: string | null; pending: string | null; approvalId: string | null; error: string | null }
const initialState: GitState = { projectId: null, status: null, branches: null, diff: [], selectedPath: null, pending: null, approvalId: null, error: null }

export const runGitAction = createAsyncThunk('git/run', async ({ projectId, action }: { projectId: string; action: GitAction }) => {
  const response = await runGitActionRuntime(projectId, action)
  return { action: action.action, response }
})

const slice = createSlice({ name: 'git', initialState, reducers: {
  selectGitProject(state, action: PayloadAction<string | null>) { state.projectId = action.payload; state.status = null; state.branches = null; state.diff = []; state.selectedPath = null; state.error = null },
  selectDiffPath(state, action: PayloadAction<string | null>) { state.selectedPath = action.payload },
  setGitResult(state, action: PayloadAction<{ action: string; data: unknown }>) { if (action.payload.action === 'status') state.status = action.payload.data as GitStatus; if (action.payload.action === 'branches') state.branches = action.payload.data as GitBranches; if (action.payload.action === 'diff') state.diff = action.payload.data as GitDiffFile[] },
}, extraReducers: builder => builder
  .addCase(runGitAction.pending, (state, action) => { state.pending = String(action.meta.arg.action.action); state.error = null; state.approvalId = null })
  .addCase(runGitAction.fulfilled, (state, action) => { state.pending = null; if (action.payload.response.kind === 'approval') { state.approvalId = action.payload.response.approval.id; return } ; slice.caseReducers.setGitResult(state, { type: 'git/setGitResult', payload: { action: action.payload.action, data: action.payload.response.data } }) })
  .addCase(runGitAction.rejected, (state, action) => { state.pending = null; state.error = action.error.message ?? 'Git operation failed' }) })

export const { selectGitProject, selectDiffPath, setGitResult } = slice.actions
export default slice.reducer
