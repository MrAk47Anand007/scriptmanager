export type AgentAccessLevel = 'observe' | 'develop' | 'full'

const OBSERVE = new Set(['file.read', 'workspace.inspect', 'git.status', 'git.diff'])
const DEVELOP = new Set([...OBSERVE, 'file.write', 'command.execute', 'git.local'])
const PROTECTED = new Set(['secret.read', 'git.push', 'git.force', 'remote.execute', 'deploy.execute'])
const ROUTED = new Set(['file.write', 'command.execute', 'git.status', 'git.diff', 'git.local', ...PROTECTED])

export function evaluateAgentAccess(level: AgentAccessLevel, capability: string) {
  const protectedAction = PROTECTED.has(capability)
  const eligible = level === 'full' || (level === 'develop' ? DEVELOP.has(capability) : OBSERVE.has(capability))
  return { eligible, approvalRequired: eligible && ROUTED.has(capability), protectedAction }
}
