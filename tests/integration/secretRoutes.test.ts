import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { GET, POST } from '@/app/api/secrets/route'
import { POST as rotate } from '@/app/api/secrets/[id]/rotate/route'
import { POST as reveal } from '@/app/api/secrets/[id]/reveal/route'

const jsonRequest = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const context = (id: string) => ({ params: Promise.resolve({ id }) })

describe('secret vault routes', () => {
  beforeEach(async () => {
    await prisma.secretAccessEvent.deleteMany()
    await prisma.secretBinding.deleteMany()
    await prisma.secretVersion.deleteMany()
    await prisma.secret.deleteMany()
  })

  it('creates and lists metadata without leaking plaintext', async () => {
    const createResponse = await POST(jsonRequest('http://localhost/api/secrets', { name: 'API token', plaintext: 'route-plaintext', workspaceId: 'default' }))
    expect(createResponse.status).toBe(201)
    const created = await createResponse.json()
    expect(JSON.stringify(created)).not.toContain('route-plaintext')

    const listResponse = await GET(new Request('http://localhost/api/secrets?workspaceId=default'))
    const list = await listResponse.json()
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain('route-plaintext')
  })

  it('rotates and explicitly reveals one value', async () => {
    const created = await (await POST(jsonRequest('http://localhost/api/secrets', { name: 'Deploy token', plaintext: 'first-value', workspaceId: 'default' }))).json()
    expect((await rotate(jsonRequest('http://localhost/api/secrets/x/rotate', { plaintext: 'second-value', resource: '*' }), context(created.id))).status).toBe(200)
    const revealResponse = await reveal(jsonRequest('http://localhost/api/secrets/x/reveal', { resource: '*', reason: 'user requested reveal' }), context(created.id))
    expect(await revealResponse.json()).toMatchObject({ plaintext: 'second-value', version: 2 })
  })
})
