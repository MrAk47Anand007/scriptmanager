import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { POST } from '@/app/api/scripts/[id]/env/route'

const context = { params: Promise.resolve({ id: 'script_phase5_migration' }) }

describe('secret integration migration', () => {
  beforeEach(async () => {
    await prisma.secretAccessEvent.deleteMany(); await prisma.secretBinding.deleteMany(); await prisma.secretVersion.deleteMany(); await prisma.secret.deleteMany()
    await prisma.scriptEnvVar.deleteMany(); await prisma.script.deleteMany({ where: { id: 'script_phase5_migration' } })
    await prisma.script.create({ data: { id: 'script_phase5_migration', name: 'Vault script', filename: 'vault.py', language: 'python' } })
  })

  it('stores secret script environment values as opaque vault references', async () => {
    const response = await POST(new Request('http://localhost/api/scripts/x/env', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'DEPLOY_TOKEN', value: 'migration-plaintext', is_secret: true }) }), context)
    expect(response.status).toBe(200)
    const env = await prisma.scriptEnvVar.findFirstOrThrow({ where: { scriptId: 'script_phase5_migration', key: 'DEPLOY_TOKEN' } })
    expect(env.value).toMatch(/^secretref:/)
    expect(env.value).not.toContain('migration-plaintext')
    expect(await prisma.secretBinding.count({ where: { resourceType: 'script', resourceId: 'script_phase5_migration', field: 'DEPLOY_TOKEN' } })).toBe(1)
  })
})
