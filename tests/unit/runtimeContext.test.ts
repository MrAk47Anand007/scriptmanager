import { describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE } from '@/lib/auth'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { createDesktopActorContext, requireTrustedContext } from '@/lib/runtime/trustedContext'

describe('trusted actor context', () => {
  it('creates a desktop owner context without request body identity', async () => {
    const actor = await createDesktopActorContext(prisma)
    expect(actor).toMatchObject({
      runtimeMode: 'desktop',
      authType: 'desktop',
      actorId: 'local-admin',
      workspaceId: 'default',
      roleKey: 'owner',
    })
  })

  it('throws a stable unauthorized error when a route forgets to require context', () => {
    expect(() => requireTrustedContext(null)).toThrow('Unauthorized')
  })

  it('resolves desktop cookies into the shared trusted context shape', async () => {
    process.env.DESKTOP_AUTH_SECRET = 'desktop-context-test'
    const request = new Request('http://localhost/api/workflows', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent('desktop:desktop-context-test')}` },
    })

    await expect(resolveTrustedRequestContext(request, prisma)).resolves.toMatchObject({
      runtimeMode: 'desktop',
      authType: 'desktop',
      actorId: 'local-admin',
      workspaceId: 'default',
    })
  })
})
