import { classifyGitAction, resolveRepositoryPath } from './policy'
import { parseBranches, parseStatus, parseUnifiedDiff } from './parser'
import type { GitProcessRunner } from './process'
import type { GitAction, RepositoryWorkspace } from './types'

export interface GitActor { type: 'user' | 'agent'; id: string; name?: string }
interface GitAudit { action: string; projectId: string; actor: GitActor; outcome: 'succeeded' | 'failed' | 'approval_required'; detail?: unknown }
interface GitServiceDeps {
  run: GitProcessRunner
  audit: (event: GitAudit) => Promise<unknown> | unknown
  requestApproval?: (input: { workspace: RepositoryWorkspace; action: GitAction; actor: GitActor }) => Promise<unknown>
}

function actionArgs(action: GitAction): string[] {
  switch (action.action) {
    case 'status': return ['status', '--short', '--branch']
    case 'diff': return ['diff', '--no-ext-diff', '--', action.path ?? '.']
    case 'branches': return ['branch', '--all', '--no-color']
    case 'checkout': return ['checkout', ...(action.force ? ['--force'] : []), action.branch ?? '']
    case 'commit': return ['commit', '-m', action.message ?? '']
    case 'fetch': return ['fetch', action.remote ?? 'origin']
    case 'pull': return ['pull', '--ff-only', action.remote ?? 'origin', action.branch ?? '']
    case 'push': return ['push', ...(action.force ? ['--force-with-lease'] : []), action.remote ?? 'origin', action.branch ?? '']
    case 'clean': return ['clean', '-fd']
  }
}

export function createGitService(deps: GitServiceDeps) {
  return { async execute(workspace: RepositoryWorkspace, action: GitAction, actor: GitActor) {
    resolveRepositoryPath(workspace.root)
    if (action.path) resolveRepositoryPath(workspace.root, action.path)
    const decision = classifyGitAction(action, workspace.policy)
    if (!decision.allowed) throw new Error(decision.reason)
    if (decision.protected) {
      if (!deps.requestApproval) throw new Error('Approval service is unavailable')
      const approval = await deps.requestApproval({ workspace, action, actor })
      await deps.audit({ action: action.action, projectId: workspace.projectId, actor, outcome: 'approval_required' })
      return { kind: 'approval' as const, approval }
    }
    const args = actionArgs(action)
    if (args.some(value => value === '')) throw new Error(`Missing input for Git ${action.action}`)
    const processResult = await deps.run(workspace.root, args)
    if (processResult.exitCode !== 0) {
      await deps.audit({ action: action.action, projectId: workspace.projectId, actor, outcome: 'failed', detail: processResult.stderr })
      throw new Error(processResult.stderr.trim() || `Git ${action.action} failed`)
    }
    let data: unknown = { output: processResult.stdout }
    if (action.action === 'status') data = parseStatus(processResult.stdout)
    if (action.action === 'branches') data = parseBranches(processResult.stdout)
    if (action.action === 'diff') data = parseUnifiedDiff(processResult.stdout)
    await deps.audit({ action: action.action, projectId: workspace.projectId, actor, outcome: 'succeeded' })
    return { kind: 'result' as const, data }
  } }
}
