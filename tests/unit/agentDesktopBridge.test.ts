import { describe, expect, it } from 'vitest'
import { getAgentProviderSpec, validateAgentLaunch } from '../../electron/agentRuntime'

describe('agent desktop bridge', () => {
  it('allowlists provider executables and validates workspace launches', () => {
    expect(getAgentProviderSpec('codex')).toMatchObject({ executable: 'codex-acp' })
    expect(getAgentProviderSpec('claude')).toMatchObject({ executable: 'claude-agent-acp' })
    expect(validateAgentLaunch({ provider: 'codex', sessionId: 's1', cwd: 'C:/workspace', profileId: 'p1' })).toBe(true)
    expect(() => validateAgentLaunch({ provider: 'other' as 'codex', sessionId: 's1', cwd: '.', profileId: 'p1' })).toThrow('Unsupported')
  })
})
