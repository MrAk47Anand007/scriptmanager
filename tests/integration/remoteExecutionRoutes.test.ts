import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { hashSessionToken } from '@/lib/rbac/requestContext'

const { execRemoteMock } = vi.hoisted(() => ({
  execRemoteMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/sshService', () => ({
  execRemote: execRemoteMock,
}))

import { POST as approve } from '@/app/api/ops/remote-exec/[id]/approve/route'
import { POST as reject } from '@/app/api/ops/remote-exec/[id]/reject/route'

let sessionCookie = ''

describe('remote execution approval routes', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.remoteExecution.deleteMany()
    await prisma.serverProfile.deleteMany()
    await prisma.project.deleteMany()
    await prisma.script.deleteMany()
    execRemoteMock.mockClear()

    const sessionId = crypto.randomUUID()
    const token = createSessionToken({ userId: 'local-admin', workspaceId: 'default', sessionId })
    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: 'local-admin',
        workspaceId: 'default',
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    sessionCookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  })

  afterEach(async () => {
    await prisma.userSession.deleteMany({ where: { userId: 'local-admin' } })
  })

  it('approves with the authenticated actor instead of a forged approver_name', async () => {
    const script = await prisma.script.create({
      data: {
        id: 'script-1',
        name: 'Deploy',
        filename: 'deploy.sh',
      },
    })
    const project = await prisma.project.create({
      data: {
        id: 'project-1',
        name: 'Prod',
        environment: 'production',
      },
    })
    const profile = await prisma.serverProfile.create({
      data: {
        id: 'profile-1',
        name: 'Production SSH',
        host: 'example.test',
        username: 'deploy',
        projectId: project.id,
      },
    })
    const execution = await prisma.remoteExecution.create({
      data: {
        id: 'remote-1',
        scriptId: script.id,
        profileId: profile.id,
        scriptName: script.name,
        profileName: profile.name,
        serverHost: profile.host,
        status: 'pending_approval',
      },
    })

    const response = await approve(new Request('http://localhost/api/ops/remote-exec/remote-1/approve', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ approver_name: 'forged-user' }),
    }), { params: Promise.resolve({ id: execution.id }) })

    expect(response.status).toBe(200)
    expect((await prisma.remoteExecution.findUniqueOrThrow({ where: { id: execution.id } })).approvedBy).toBe('local-admin')
    expect(execRemoteMock).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        actor: { type: 'user', id: 'local-admin' },
      }),
    }))
  })

  it('rejects pending executions and keeps the decision server-attributed', async () => {
    const script = await prisma.script.create({
      data: {
        id: 'script-2',
        name: 'Rollback',
        filename: 'rollback.sh',
      },
    })
    const profile = await prisma.serverProfile.create({
      data: {
        id: 'profile-2',
        name: 'UAT SSH',
        host: 'uat.example.test',
        username: 'deploy',
      },
    })
    const execution = await prisma.remoteExecution.create({
      data: {
        id: 'remote-2',
        scriptId: script.id,
        profileId: profile.id,
        scriptName: script.name,
        profileName: profile.name,
        serverHost: profile.host,
        status: 'pending_approval',
      },
    })

    const response = await reject(new Request('http://localhost/api/ops/remote-exec/remote-2/reject', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    }), { params: Promise.resolve({ id: execution.id }) })

    expect(response.status).toBe(200)
    expect((await prisma.remoteExecution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('rejected')
  })
})
