import path from 'node:path'
import type { GitAction, WorkspacePolicy } from './types'
import { DEFAULT_WORKSPACE_POLICY } from './types'

export function parseWorkspacePolicy(value?: string | null): WorkspacePolicy {
  if (!value) return DEFAULT_WORKSPACE_POLICY
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_WORKSPACE_POLICY
    const policy = parsed as Record<string, unknown>
    return {
      allowCommit: typeof policy.allowCommit === 'boolean' ? policy.allowCommit : DEFAULT_WORKSPACE_POLICY.allowCommit,
      allowPull: typeof policy.allowPull === 'boolean' ? policy.allowPull : DEFAULT_WORKSPACE_POLICY.allowPull,
      requireApprovalForPush: typeof policy.requireApprovalForPush === 'boolean' ? policy.requireApprovalForPush : DEFAULT_WORKSPACE_POLICY.requireApprovalForPush,
      requireApprovalForForce: typeof policy.requireApprovalForForce === 'boolean' ? policy.requireApprovalForForce : DEFAULT_WORKSPACE_POLICY.requireApprovalForForce,
      requireApprovalForCleanup: typeof policy.requireApprovalForCleanup === 'boolean' ? policy.requireApprovalForCleanup : DEFAULT_WORKSPACE_POLICY.requireApprovalForCleanup,
    }
  }
  catch { return DEFAULT_WORKSPACE_POLICY }
}

const GIT_ACTION_NAMES = ['status', 'diff', 'branches', 'checkout', 'commit', 'fetch', 'pull', 'push', 'clean'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(input: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  if (!(key in input)) return undefined
  if (typeof input[key] !== 'string') throw new Error(`Git ${key} must be a string`)
  const value = input[key].trim()
  if (!value) throw new Error(`Git ${key} is required`)
  if (value.length > maxLength) throw new Error(`Git ${key} is too long`)
  if (value.includes('\0')) throw new Error(`Git ${key} contains an invalid character`)
  return value
}

function readToken(input: Record<string, unknown>, key: string): string | undefined {
  const value = readString(input, key, 255)
  if (value && (/^[-]/.test(value) || /\s/.test(value))) throw new Error(`Git ${key} is invalid`)
  return value
}

export function parseGitAction(input: unknown): GitAction {
  if (!isRecord(input) || typeof input.action !== 'string' || !GIT_ACTION_NAMES.includes(input.action as typeof GIT_ACTION_NAMES[number])) {
    throw new Error('Git action is invalid')
  }

  const action = input.action as GitAction['action']
  const parsed: GitAction = { action }
  const pathValue = readString(input, 'path', 4096)
  const branch = readToken(input, 'branch')
  const remote = readToken(input, 'remote')
  const message = readString(input, 'message', 10_000)

  if (input.force !== undefined && typeof input.force !== 'boolean') throw new Error('Git force must be a boolean')
  if (pathValue !== undefined) parsed.path = pathValue
  if (branch !== undefined) parsed.branch = branch
  if (remote !== undefined) parsed.remote = remote
  if (message !== undefined) parsed.message = message
  if (input.force !== undefined) parsed.force = input.force

  if (action === 'checkout' && !branch) throw new Error('Git checkout branch is required')
  if (action === 'commit' && !message) throw new Error('Git commit message is required')
  return parsed
}

export function resolveRepositoryPath(root: string, requestedPath = '.'): string {
  if (/^[a-zA-Z]:[\\/]/.test(requestedPath) || requestedPath.startsWith('\\\\')) {
    throw new Error('Requested path is outside the granted repository root')
  }

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
