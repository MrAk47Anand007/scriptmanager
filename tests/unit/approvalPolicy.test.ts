import { describe, expect, it } from 'vitest'
import { canGrantDecision, grantMatches, isApprovalExpired } from '@/lib/approvals/policy'

describe('approval policy', () => {
  it('limits persistent decisions and never grants protected workspace actions', () => {
    expect(canGrantDecision('allow_once', false)).toBe(true)
    expect(canGrantDecision('allow_run', false)).toBe(true)
    expect(canGrantDecision('allow_workspace', true)).toBe(false)
    expect(canGrantDecision('reject', false)).toBe(true)
  })

  it('matches every persisted scope dimension', () => {
    const grant = { actorId: 'agent:1', workspaceId: 'ws', capability: 'filesystem.write', resource: 'src', policyVersion: 1, expiresAt: null }
    expect(grantMatches(grant, { ...grant, resource: 'src/app' }, new Date())).toBe(true)
    expect(grantMatches(grant, { ...grant, actorId: 'agent:2' }, new Date())).toBe(false)
  })

  it('expires requests at their deadline', () => {
    expect(isApprovalExpired(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(true)
  })
})
