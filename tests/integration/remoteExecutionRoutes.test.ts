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

  it('rejects unauthenticated remote execution requests', async () => {
    const script = await prisma.script.create({ data: { id: 'script-unauth', name: 'Deploy', filename: 'deploy.sh' } })
    const profile = await prisma.serverProfile.create({ data: { id: 'profile-unauth', name: 'SSH', host: 'example.test', username: 'deploy' } })

    const { POST } = await import('@/app/api/ops/remote-exec/route')
    const response = await POST(new Request('http://localhost/api/ops/remote-exec', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: profile.id, scriptId: script.id }),
    }))

    expect(response.status).toBe(401)
    expect(execRemoteMock).not.toHaveBeenCalled()
  })

  it('does not approve an execution whose script is outside the profile workspace', async () => {
    const script = await prisma.script.create({ data: { id: 'script-foreign-workspace', workspaceId: 'foreign-workspace', name: 'Foreign deploy', filename: 'deploy.sh' } })
    const profile = await prisma.serverProfile.create({ data: { id: 'profile-default-workspace', workspaceId: 'default', name: 'SSH', host: 'example.test', username: 'deploy' } })
    const execution = await prisma.remoteExecution.create({
      data: { id: 'remote-foreign-script', scriptId: script.id, profileId: profile.id, scriptName: script.name, profileName: profile.name, serverHost: profile.host, status: 'pending_approval' },
    })

    const response = await approve(new Request('http://localhost/api/ops/remote-exec/remote-foreign-script/approve', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    }), { params: Promise.resolve({ id: execution.id }) })

    expect(response.status).toBe(404)
    expect((await prisma.remoteExecution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('pending_approval')
    expect(execRemoteMock).not.toHaveBeenCalled()
  })

  it('requires approval permission for remote execution decisions', async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId: 'default', key: 'viewer' } } })
    await prisma.membership.updateMany({ where: { userId: 'local-admin', workspaceId: 'default' }, data: { roleId: viewerRole.id } })

    const script = await prisma.script.create({ data: { id: 'script-viewer-approval', name: 'Deploy', filename: 'deploy.sh' } })
    const profile = await prisma.serverProfile.create({ data: { id: 'profile-viewer-approval', name: 'SSH', host: 'example.test', username: 'deploy' } })
    const execution = await prisma.remoteExecution.create({
      data: { id: 'remote-viewer-approval', scriptId: script.id, profileId: profile.id, scriptName: script.name, profileName: profile.name, serverHost: profile.host, status: 'pending_approval' },
    })

    const approveResponse = await approve(new Request('http://localhost/api/ops/remote-exec/remote-viewer-approval/approve', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    }), { params: Promise.resolve({ id: execution.id }) })
    const rejectResponse = await reject(new Request('http://localhost/api/ops/remote-exec/remote-viewer-approval/reject', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    }), { params: Promise.resolve({ id: execution.id }) })

    expect(approveResponse.status).toBe(403)
    expect(rejectResponse.status).toBe(403)
    expect((await prisma.remoteExecution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('pending_approval')
    expect(execRemoteMock).not.toHaveBeenCalled()
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
