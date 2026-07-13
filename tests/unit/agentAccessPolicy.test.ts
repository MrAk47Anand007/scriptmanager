import { describe, expect, it } from 'vitest'
import { evaluateAgentAccess } from '@/lib/agents/accessPolicy'

describe('agent access policy', () => {
  it('keeps observe read-only and develop workspace-scoped', () => {
    expect(evaluateAgentAccess('observe', 'file.read')).toMatchObject({ eligible: true, approvalRequired: false })
    expect(evaluateAgentAccess('observe', 'file.write').eligible).toBe(false)
    expect(evaluateAgentAccess('develop', 'file.write')).toMatchObject({ eligible: true, approvalRequired: true })
    expect(evaluateAgentAccess('develop', 'deploy.execute').eligible).toBe(false)
  })

  it('requires approval for protected actions even under full access', () => {
    for (const capability of ['secret.read', 'git.push', 'remote.execute', 'deploy.execute']) {
      expect(evaluateAgentAccess('full', capability)).toEqual({ eligible: true, approvalRequired: true, protectedAction: true })
    }
  })
})
