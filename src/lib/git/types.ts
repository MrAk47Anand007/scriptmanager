export type GitActionName = 'status' | 'diff' | 'branches' | 'checkout' | 'commit' | 'fetch' | 'pull' | 'push' | 'clean'

export interface GitAction {
  action: GitActionName
  path?: string
  branch?: string
  message?: string
  remote?: string
  force?: boolean
}

export interface WorkspacePolicy {
  allowCommit: boolean
  allowPull: boolean
  requireApprovalForPush: boolean
  requireApprovalForForce: boolean
  requireApprovalForCleanup: boolean
}

export const DEFAULT_WORKSPACE_POLICY: WorkspacePolicy = {
  allowCommit: true,
  allowPull: true,
  requireApprovalForPush: true,
  requireApprovalForForce: true,
  requireApprovalForCleanup: true,
}

export interface RepositoryWorkspace {
  projectId: string
  name: string
  root: string
  defaultBranch: string
  remoteUrl?: string | null
  policy: WorkspacePolicy
}

export interface GitFileStatus { path: string; index: string; workingTree: string; state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' }
export interface GitStatus { branch: string; upstream: string | null; ahead: number; behind: number; files: GitFileStatus[]; clean: boolean }
export interface GitBranches { current: string | null; local: string[]; remote: string[] }
export interface GitDiffFile { path: string; additions: number; deletions: number; patch: string }
