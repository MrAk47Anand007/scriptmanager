import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { ensureFreshScript } from '@/lib/storage/syncService'

describe('cloud storage sync', () => {
  it('skips remote access for scripts outside cloud-bound collections', async () => {
    const database = {
      script: {
        findUnique: async () => ({ id: 'script-1', collection: null }),
      },
    } as unknown as PrismaClient

    await expect(ensureFreshScript(database, 'script-1', '/tmp/scripts'))
      .resolves.toEqual({ ok: true })
  })

  it('degrades database failures to a cached-copy warning', async () => {
    const database = {
      script: { findUnique: async () => { throw new Error('database unavailable') } },
    } as unknown as PrismaClient

    await expect(ensureFreshScript(database, 'script-1', '/tmp/scripts')).resolves.toEqual({
      ok: true, stale: true, warning: 'cloud sync error — running local copy',
    })
  })
})
