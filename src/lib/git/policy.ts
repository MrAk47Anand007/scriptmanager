import path from 'node:path'
import type { GitAction, WorkspacePolicy } from './types'
import { DEFAULT_WORKSPACE_POLICY } from './types'

export function parseWorkspacePolicy(value?: string | null): WorkspacePolicy {
  if (!value) return DEFAULT_WORKSPACE_POLICY
  try { return { ...DEFAULT_WORKSPACE_POLICY, ...JSON.parse(value) } }
  catch { return DEFAULT_WORKSPACE_POLICY }
}

export function resolveRepositoryPath(root: string, requestedPath = '.'): string {
  const normalizedRoot = path.resolve(root)
  const resolved = path.resolve(normalizedRoot, requestedPath)
  const relative = path.relative(normalizedRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Requested path is outside the granted repository root')
  return resolved
}

export function classifyGitAction(action: GitAction, policy: WorkspacePolicy = DEFAULT_WORKSPACE_POLICY) {
  if (action.action === 'commit' && !policy.allowCommit) return { allowed: false, protected: false, reason: 'Commits are disabled by workspace policy' }
  if (action.action === 'pull' && !policy.allowPull) return { allowed: false, protected: false, reason: 'Pull is disabled by workspace policy' }
  const protectedAction = (action.action === 'push' && policy.requireApprovalForPush)
    || (Boolean(action.force) && policy.requireApprovalForForce)
    || (action.action === 'clean' && policy.requireApprovalForCleanup)
  return { allowed: true, protected: protectedAction, reason: protectedAction ? 'This Git operation requires approval' : undefined }
}
