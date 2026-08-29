import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listProjects, POST as createProject } from '@/app/api/projects/route'
import { DELETE as deleteProject, GET as readProject, PUT as updateProject } from '@/app/api/projects/[id]/route'

let projectId = ''
let foreignProjectId = ''
let sessionId = ''
let sessionCookie = ''

describe('project route authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    projectId = crypto.randomUUID()
    foreignProjectId = crypto.randomUUID()
    await prisma.project.create({ data: { id: projectId, workspaceId: 'default', name: 'Default project' } })
    await prisma.project.create({ data: { id: foreignProjectId, workspaceId: 'foreign-workspace', name: 'Foreign project' } })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: { in: [projectId, foreignProjectId] } } })
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated project access', async () => {
    const response = await listProjects(new Request('http://localhost/api/projects'))
    expect(response.status).toBe(401)
  })

  it('does not expose or mutate a project from another workspace', async () => {
    const headers = { cookie: sessionCookie, 'content-type': 'application/json' }
    await expect(readProject(new Request('http://localhost/api/projects/foreign', { headers }), { params: Promise.resolve({ id: foreignProjectId }) })).resolves.toMatchObject({ status: 404 })
    await expect(updateProject(new Request('http://localhost/api/projects/foreign', { method: 'PUT', headers, body: JSON.stringify({ name: 'Tampered' }) }), { params: Promise.resolve({ id: foreignProjectId }) })).resolves.toMatchObject({ status: 404 })
    await expect(deleteProject(new Request('http://localhost/api/projects/foreign', { method: 'DELETE', headers }), { params: Promise.resolve({ id: foreignProjectId }) })).resolves.toMatchObject({ status: 404 })

    const projects = await listProjects(new Request('http://localhost/api/projects', { headers: { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' } }))
    expect((await projects.json()).map((project: { id: string }) => project.id)).toEqual([projectId])
  })

  it('creates new projects in the authenticated workspace, not the requested header workspace', async () => {
    const response = await createProject(new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Created project' }),
    }))

    expect(response.status).toBe(201)
    const created = await response.json()
    expect((await prisma.project.findUniqueOrThrow({ where: { id: created.id } })).workspaceId).toBe('default')
    await prisma.project.delete({ where: { id: created.id } })
  })
})
