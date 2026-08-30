import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listBuilds } from '@/app/api/builds/[id]/route'
import { GET as streamBuild } from '@/app/api/builds/[id]/stream/route'
import { GET as readBuildOutput } from '@/app/api/builds/output/[scriptId]/[buildId]/route'

let sessionId = ''
let sessionCookie = ''
let localScriptId = ''
let foreignScriptId = ''
let foreignBuildId = ''

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

describe('build route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    localScriptId = `build-local-script-${crypto.randomUUID()}`
    foreignScriptId = `build-foreign-script-${crypto.randomUUID()}`
    foreignBuildId = `build-foreign-${crypto.randomUUID()}`
    await prisma.script.create({ data: { id: localScriptId, workspaceId: 'default', name: 'Local build script', filename: `${localScriptId}.sh` } })
    await prisma.script.create({ data: { id: foreignScriptId, workspaceId: 'foreign-workspace', name: 'Foreign build script', filename: `${foreignScriptId}.sh` } })
    await prisma.build.create({ data: { id: foreignBuildId, scriptId: foreignScriptId, status: 'running' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
    await prisma.build.deleteMany({ where: { id: foreignBuildId } })
    await prisma.script.deleteMany({ where: { id: { in: [localScriptId, foreignScriptId] } } })
  })

  it('rejects unauthenticated build history and output access', async () => {
    expect((await listBuilds(new Request('http://localhost/api/builds/script'), params({ id: 'script' }))).status).toBe(401)
    expect((await readBuildOutput(new Request('http://localhost/api/builds/output/script/build'), params({ scriptId: 'script', buildId: 'build' }))).status).toBe(401)
  })

  it('does not expose a build from another workspace', async () => {
    const listResponse = await listBuilds(new Request(`http://localhost/api/builds/${foreignScriptId}`, { headers: { cookie: sessionCookie } }), params({ id: foreignScriptId }))
    expect(listResponse.status).toBe(200)
    expect((await listResponse.json() as Array<{ id: string }>).some((build) => build.id === foreignBuildId)).toBe(false)

    const outputResponse = await readBuildOutput(new Request(`http://localhost/api/builds/output/${foreignScriptId}/${foreignBuildId}`, { headers: { cookie: sessionCookie } }), params({ scriptId: foreignScriptId, buildId: foreignBuildId }))
    expect(outputResponse.status).toBe(404)

    const streamResponse = await streamBuild(new Request(`http://localhost/api/builds/${foreignBuildId}/stream`, { headers: { cookie: sessionCookie } }), params({ id: foreignBuildId }))
    expect(streamResponse.status).toBe(404)
  })
})
