import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'
import { GET as listWorkflows, POST as createWorkflow } from '@/app/api/workflows/route'
import { GET as readWorkflow, DELETE as deleteWorkflow } from '@/app/api/workflows/[id]/route'
import { POST as validateWorkflow } from '@/app/api/workflows/[id]/validate/route'
import { POST as publishWorkflow } from '@/app/api/workflows/[id]/publish/route'
import { GET as listRuns } from '@/app/api/workflows/[id]/runs/route'
import { GET as listTriggers, POST as createTrigger } from '@/app/api/workflows/[id]/triggers/route'

const definition = {
  schemaVersion: 1,
  name: 'Workspace flow',
  nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1 } }],
  edges: [],
}

let sessionId = ''
let sessionCookie = ''
let foreignWorkflowId = ''

describe('workflow route workspace authorization', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.workflow.deleteMany()
    foreignWorkflowId = `foreign_workflow_${crypto.randomUUID()}`
    await prisma.workflow.create({
      data: {
        id: foreignWorkflowId,
        workspaceId: 'foreign-workspace',
        name: 'Foreign workflow',
        draftDefinition: JSON.stringify(definition),
      },
    })

    sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: { id: sessionId, userId: 'local-admin', workspaceId: 'default', tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60_000) },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
  })

  it('rejects unauthenticated workflow access', async () => {
    expect((await listWorkflows(new Request('http://localhost/api/workflows'))).status).toBe(401)
    expect((await readWorkflow(new Request('http://localhost/api/workflows/' + foreignWorkflowId), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(401)
    expect((await listTriggers(new Request('http://localhost/api/triggers'), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(401)
  })

  it('ignores forged workspace headers and hides foreign workflows across actions', async () => {
    const headers = { cookie: sessionCookie, 'x-scriptmanager-workspace-id': 'foreign-workspace' }
    const localWorkflow = await prisma.workflow.create({
      data: { workspaceId: 'default', name: 'Local workflow', draftDefinition: JSON.stringify(definition) },
    })

    const workflowsResponse = await listWorkflows(new Request('http://localhost/api/workflows', { headers }))
    expect((await workflowsResponse.json() as Array<{ id: string }>).map((workflow) => workflow.id)).toEqual([localWorkflow.id])
    expect((await readWorkflow(new Request('http://localhost/api/workflows/' + foreignWorkflowId, { headers }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect((await validateWorkflow(new Request('http://localhost/api/validate', { method: 'POST', headers, body: JSON.stringify({}) }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect((await publishWorkflow(new Request('http://localhost/api/publish', { method: 'POST', headers }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect((await listRuns(new Request('http://localhost/api/runs', { headers }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect((await listTriggers(new Request('http://localhost/api/triggers', { headers }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect((await deleteWorkflow(new Request('http://localhost/api/workflows/' + foreignWorkflowId, { method: 'DELETE', headers }), { params: Promise.resolve({ id: foreignWorkflowId }) })).status).toBe(404)
    expect(await prisma.workflow.findUnique({ where: { id: foreignWorkflowId } })).not.toBeNull()
  })

  it('creates workflows in the authenticated workspace and rejects foreign trigger creation', async () => {
    const response = await createWorkflow(new Request('http://localhost/api/workflows', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-scriptmanager-workspace-id': 'foreign-workspace' },
      body: JSON.stringify({ name: 'Trusted workflow', definition }),
    }))
    expect(response.status).toBe(201)
    const created = await prisma.workflow.findFirstOrThrow({ where: { name: 'Trusted workflow' } })
    expect(created.workspaceId).toBe('default')

    const triggerResponse = await createTrigger(new Request('http://localhost/api/triggers', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'cron', cron: '* * * * *' }),
    }), { params: Promise.resolve({ id: foreignWorkflowId }) })
    expect(triggerResponse.status).toBe(404)
  })

  it('returns an empty trigger config when persisted trigger JSON is malformed', async () => {
    const workflow = await prisma.workflow.create({
      data: { workspaceId: 'default', name: 'Trigger config workflow', draftDefinition: JSON.stringify(definition) },
    })
    await prisma.workflowTrigger.create({ data: { workflowId: workflow.id, type: 'webhook', configJson: 'not-json' } })

    const response = await listTriggers(new Request('http://localhost/api/triggers', { headers: { cookie: sessionCookie } }), { params: Promise.resolve({ id: workflow.id }) })

    expect(response.status).toBe(200)
    expect((await response.json() as Array<{ config: unknown }>)[0].config).toEqual({})
  })
})
