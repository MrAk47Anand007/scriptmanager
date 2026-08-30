import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listTags } from '@/app/api/tags/route'
import { GET as listTemplates } from '@/app/api/templates/route'
import { DELETE as deleteTemplate } from '@/app/api/templates/[id]/route'
import { GET as exportScripts } from '@/app/api/export/route'

let sessionId = ''
let sessionCookie = ''
let foreignTemplateId = ''
let foreignTagId = ''

describe('tag, template, and export authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.scriptTag.deleteMany()
    await prisma.tag.deleteMany()
    await prisma.scriptTemplate.deleteMany()

    foreignTagId = `foreign_tag_${crypto.randomUUID()}`
    foreignTemplateId = `foreign_template_${crypto.randomUUID()}`
    await prisma.tag.create({ data: { id: foreignTagId, workspaceId: 'foreign-workspace', name: `foreign-${crypto.randomUUID()}` } })
    await prisma.scriptTemplate.create({ data: { id: foreignTemplateId, workspaceId: 'foreign-workspace', name: `Foreign ${crypto.randomUUID()}`, content: 'foreign content' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({ data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) } })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated tag, template, and export access', async () => {
    expect((await listTags(new Request('http://localhost/api/tags'))).status).toBe(401)
    expect((await listTemplates(new Request('http://localhost/api/templates'))).status).toBe(401)
    expect((await exportScripts(new Request('http://localhost/api/export'))).status).toBe(401)
  })

  it('does not list foreign tags or templates and does not export foreign scripts', async () => {
    const headers = { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' }
    const tagsResponse = await listTags(new Request('http://localhost/api/tags', { headers }))
    expect(tagsResponse.status).toBe(200)
    expect((await tagsResponse.json() as Array<{ id: string }>).some((tag) => tag.id === foreignTagId)).toBe(false)

    const templatesResponse = await listTemplates(new Request('http://localhost/api/templates', { headers }))
    expect(templatesResponse.status).toBe(200)
    expect((await templatesResponse.json() as Array<{ id: string }>).some((template) => template.id === foreignTemplateId)).toBe(false)

    const exportResponse = await exportScripts(new Request('http://localhost/api/export', { headers }))
    expect(exportResponse.status).toBe(200)
    expect((JSON.parse(await exportResponse.text()) as { scripts: Array<{ name: string }> }).scripts.some((script) => script.name.startsWith('Foreign'))).toBe(false)
  })

  it('does not delete a template from another workspace', async () => {
    const response = await deleteTemplate(new Request(`http://localhost/api/templates/${foreignTemplateId}`, { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ id: foreignTemplateId }) })
    expect(response.status).toBe(404)
    expect(await prisma.scriptTemplate.findUnique({ where: { id: foreignTemplateId } })).not.toBeNull()
  })
})
