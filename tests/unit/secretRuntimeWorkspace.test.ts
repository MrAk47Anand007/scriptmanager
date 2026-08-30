import { describe, expect, it, vi } from 'vitest'
import { resolveScriptEnvironment } from '@/lib/secrets/runtime'

describe('script secret runtime workspace context', () => {
  it('resolves secret environment values in the script workspace', async () => {
    const resolveSecret = vi.fn().mockResolvedValue('workspace-secret')
    const service = { resolveSecret }

    await expect(resolveScriptEnvironment({} as never, 'script-1', [{ key: 'TOKEN', value: 'secretref:secret-1', isSecret: true }], service as never, 'workspace-a')).resolves.toEqual({ TOKEN: 'workspace-secret' })
    expect(resolveSecret).toHaveBeenCalledWith('secret-1', expect.objectContaining({ workspaceId: 'workspace-a' }))
  })
})
