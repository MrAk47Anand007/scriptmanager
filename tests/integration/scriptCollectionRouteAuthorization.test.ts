import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listScripts, POST as saveScript } from '@/app/api/scripts/route'
import { GET as readScript } from '@/app/api/scripts/[id]/route'
import { POST as duplicateScript } from '@/app/api/scripts/[id]/duplicate/route'
import { PUT as moveScript } from '@/app/api/scripts/[id]/move/route'
import { GET as readEnv } from '@/app/api/scripts/[id]/env/route'
import { GET as readTags } from '@/app/api/scripts/[id]/tags/route'
import { GET as readSchedule } from '@/app/api/scripts/[id]/schedule/route'
import { POST as buildTerminalCommand } from '@/app/api/scripts/[id]/terminal-command/route'
import { GET as exportScript } from '@/app/api/scripts/[id]/export/route'
import { GET as listVersions } from '@/app/api/scripts/[id]/versions/route'
import { GET as readVersion } from '@/app/api/scripts/[id]/versions/[versionId]/route'
import { POST as regenerateWebhook } from '@/app/api/scripts/[id]/webhook/regenerate/route'
import { POST as regenerateWebhookSecret } from '@/app/api/scripts/[id]/webhook/secret/route'
import { GET as listCollections, POST as createCollection } from '@/app/api/collections/route'
import { DELETE as deleteCollection } from '@/app/api/collections/[id]/route'

let sessionId = ''
let sessionCookie = ''
let localScriptId = ''
let foreignScriptId = ''
let localCollectionId = ''
let foreignCollectionId = ''

describe('script and collection route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.build.deleteMany()
    await prisma.scriptVersion.deleteMany()
    await prisma.scriptEnvVar.deleteMany()
    await prisma.scriptTag.deleteMany()
    await prisma.script.deleteMany()
    await prisma.collection.deleteMany()

    localCollectionId = `local_collection_${crypto.randomUUID()}`
    foreignCollectionId = `foreign_collection_${crypto.randomUUID()}`
    await prisma.collection.create({ data: { id: localCollectionId, workspaceId: 'default', name: 'Local collection' } })
    await prisma.collection.create({ data: { id: foreignCollectionId, workspaceId: 'foreign-workspace', name: 'Foreign collection' } })

    localScriptId = `local_script_${crypto.randomUUID()}`
    foreignScriptId = `foreign_script_${crypto.randomUUID()}`
    await prisma.script.create({ data: { id: localScriptId, workspaceId: 'default', collectionId: localCollectionId, name: 'Local script', filename: 'local.py' } })
    await prisma.script.create({ data: { id: foreignScriptId, workspaceId: 'foreign-workspace', collectionId: foreignCollectionId, name: 'Foreign script', filename: 'foreign.py' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated script and collection access', async () => {
    expect((await listScripts(new Request('http://localhost/api/scripts'))).status).toBe(401)
    expect((await listCollections(new Request('http://localhost/api/collections'))).status).toBe(401)
    const malformed = await saveScript(new Request('http://localhost/api/scripts', { method: 'POST', body: '{' }))
    expect(malformed.status).toBe(401)
  })

  it('lists only the authenticated workspace despite forged headers', async () => {
    const headers = { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' }
    const scriptsResponse = await listScripts(new Request('http://localhost/api/scripts', { headers }))
    expect(scriptsResponse.status).toBe(200)
    expect((await scriptsResponse.json() as Array<{ id: string }>).map((script) => script.id)).toEqual([localScriptId])

    const collectionsResponse = await listCollections(new Request('http://localhost/api/collections', { headers }))
    expect(collectionsResponse.status).toBe(200)
    expect((await collectionsResponse.json() as Array<{ id: string }>).map((collection) => collection.id)).toEqual([localCollectionId])
  })

  it('does not expose or mutate foreign scripts and collections', async () => {
    const headers = { cookie: sessionCookie, 'content-type': 'application/json' }
    const readResponse = await readScript(new Request(`http://localhost/api/scripts/${foreignScriptId}`, { headers }), { params: Promise.resolve({ id: foreignScriptId }) })
    expect(readResponse.status).toBe(404)

    const duplicateResponse = await duplicateScript(new Request(`http://localhost/api/scripts/${foreignScriptId}/duplicate`, { headers }), { params: Promise.resolve({ id: foreignScriptId }) })
    expect(duplicateResponse.status).toBe(404)

    const moveResponse = await moveScript(new Request(`http://localhost/api/scripts/${foreignScriptId}/move`, { method: 'PUT', headers, body: JSON.stringify({ collection_id: localCollectionId }) }), { params: Promise.resolve({ id: foreignScriptId }) })
    expect(moveResponse.status).toBe(404)

    const deleteResponse = await deleteCollection(new Request(`http://localhost/api/collections/${foreignCollectionId}`, { headers }), { params: Promise.resolve({ id: foreignCollectionId }) })
    expect(deleteResponse.status).toBe(404)
  })

  it('protects script actions that read content, secrets, or execution metadata', async () => {
    const headers = { cookie: sessionCookie, 'content-type': 'application/json' }
    const params = { params: Promise.resolve({ id: foreignScriptId }) }
    expect((await readEnv(new Request(`http://localhost/api/scripts/${foreignScriptId}/env`, { headers }), params)).status).toBe(404)
    expect((await readTags(new Request(`http://localhost/api/scripts/${foreignScriptId}/tags`, { headers }), params)).status).toBe(404)
    expect((await readSchedule(new Request(`http://localhost/api/scripts/${foreignScriptId}/schedule`, { headers }), params)).status).toBe(404)
    expect((await buildTerminalCommand(new Request(`http://localhost/api/scripts/${foreignScriptId}/terminal-command`, { method: 'POST', headers, body: '{}' }), params)).status).toBe(404)
    expect((await exportScript(new Request(`http://localhost/api/scripts/${foreignScriptId}/export`, { headers }), params)).status).toBe(404)
    expect((await listVersions(new Request(`http://localhost/api/scripts/${foreignScriptId}/versions`, { headers }), params)).status).toBe(404)
    expect((await readVersion(new Request(`http://localhost/api/scripts/${foreignScriptId}/versions/version-1`, { headers }), { params: Promise.resolve({ id: foreignScriptId, versionId: 'version-1' }) })).status).toBe(404)
    expect((await regenerateWebhook(new Request(`http://localhost/api/scripts/${foreignScriptId}/webhook/regenerate`, { method: 'POST', headers }), params)).status).toBe(404)
    expect((await regenerateWebhookSecret(new Request(`http://localhost/api/scripts/${foreignScriptId}/webhook/secret`, { method: 'POST', headers }), params)).status).toBe(404)
  })

  it('creates a collection in the trusted workspace and rejects foreign assignment', async () => {
    const createResponse = await createCollection(new Request('http://localhost/api/collections', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Trusted collection', project_id: null }),
    }))
    expect(createResponse.status).toBe(201)
    expect((await createResponse.json() as { workspaceId: string }).workspaceId).toBe('default')

    const scriptResponse = await saveScript(new Request('http://localhost/api/scripts', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Assigned script ${crypto.randomUUID()}`, content: 'print(1)', collection_id: foreignCollectionId }),
    }))
    expect(scriptResponse.status).toBe(404)
  })
})
