import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { hashApiToken } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { middleware } from '@/middleware'

beforeEach(async () => {
  await ensureDefaultWorkspace(prisma)
  await prisma.setting.upsert({
    where: { key: 'api_token_hash' },
    update: { value: hashApiToken('valid-test-token') },
    create: { key: 'api_token_hash', value: hashApiToken('valid-test-token') },
  })
})

afterEach(async () => {
  await prisma.setting.deleteMany({ where: { key: 'api_token_hash' } })
})

describe('bearer token authorization', () => {
  it('rejects bearer-token requests that do not match the actor workspace', async () => {
    const request = new NextRequest('http://localhost/api/secrets?workspaceId=forbidden', {
      headers: { authorization: 'Bearer valid-test-token' },
    })

    const response = await middleware(request)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'workspace_mismatch',
      permission: 'secret:read',
    })
  })
})
