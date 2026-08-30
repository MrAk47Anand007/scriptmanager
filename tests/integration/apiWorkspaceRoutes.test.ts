import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listCollections } from '@/app/api/api-collections/route'
import { GET as readRequest } from '@/app/api/api-requests/[id]/route'
import { GET as listRuns } from '@/app/api/observability/runs/route'
import { GET as readRun } from '@/app/api/observability/runs/[kind]/[id]/route'

let sessionId = ''
let sessionCookie = ''
let foreignCollectionId = ''
let foreignRequestId = ''
let foreignRunId = ''

describe('API workspace routes', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.apiCollectionRun.deleteMany()
    await prisma.apiHistory.deleteMany()
    await prisma.apiRequest.deleteMany()
    await prisma.apiEnvironment.deleteMany()
    await prisma.apiCollection.deleteMany()

    foreignCollectionId = `foreign_collection_${crypto.randomUUID()}`
    foreignRequestId = `foreign_request_${crypto.randomUUID()}`
    foreignRunId = `foreign_run_${crypto.randomUUID()}`
    await prisma.apiCollection.create({ data: { id: foreignCollectionId, workspaceId: 'foreign-workspace', name: 'Foreign collection' } })
    await prisma.apiRequest.create({ data: { id: foreignRequestId, workspaceId: 'foreign-workspace', collectionId: foreignCollectionId, name: 'Foreign request', url: 'https://example.test' } })
    await prisma.apiCollectionRun.create({ data: { id: foreignRunId, collectionId: foreignCollectionId, collectionName: 'Foreign collection', status: 'completed' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated collection reads', async () => {
    expect((await listCollections(new Request('http://localhost/api/api-collections'))).status).toBe(401)
  })

  it('does not list or read API data from another workspace', async () => {
    const listResponse = await listCollections(new Request('http://localhost/api/api-collections', { headers: { cookie: sessionCookie } }))
    expect(listResponse.status).toBe(200)
    expect((await listResponse.json()).some((collection: { id: string }) => collection.id === foreignCollectionId)).toBe(false)

    const readResponse = await readRequest(new Request(`http://localhost/api/api-requests/${foreignRequestId}`, { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ id: foreignRequestId }) })
    expect(readResponse.status).toBe(404)

    const runsResponse = await listRuns(new Request('http://localhost/api/observability/runs?kind=api', { headers: { cookie: sessionCookie } }))
    expect(runsResponse.status).toBe(200)
    expect((await runsResponse.json()).some((run: { id: string }) => run.id === foreignRunId)).toBe(false)
    const runResponse = await readRun(new Request(`http://localhost/api/observability/runs/api/${foreignRunId}`, { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ kind: 'api', id: foreignRunId }) })
    expect(runResponse.status).toBe(404)
  })
})
