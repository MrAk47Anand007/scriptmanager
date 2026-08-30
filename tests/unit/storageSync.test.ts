import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { ensureFreshScript } from '@/lib/storage/syncService'

describe('cloud storage sync', () => {
  it('skips remote access for scripts outside cloud-bound collections', async () => {
    const database = {
      script: {
        findFirst: async () => ({ id: 'script-1', collection: null }),
      },
    } as unknown as PrismaClient

    await expect(ensureFreshScript(database, 'script-1', '/tmp/scripts', 'workspace-1'))
      .resolves.toEqual({ ok: true })
  })

  it('degrades database failures to a cached-copy warning', async () => {
    const database = {
      script: { findFirst: async () => { throw new Error('database unavailable') } },
    } as unknown as PrismaClient

    await expect(ensureFreshScript(database, 'script-1', '/tmp/scripts', 'workspace-1')).resolves.toEqual({
      ok: true, stale: true, warning: 'cloud sync error — running local copy',
    })
  })

  it('queries cloud-bound scripts within the requested workspace', async () => {
    const findFirst = vi.fn(async () => null)
    const database = { script: { findFirst } } as unknown as PrismaClient

    await expect(ensureFreshScript(database, 'script-1', '/tmp/scripts', 'workspace-1')).resolves.toEqual({ ok: true })
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'script-1', workspaceId: 'workspace-1' },
      include: { collection: true },
    })
  })
})
