import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'

const { prismaMock, emitters, ensureBuildEmitterMock, executeScriptAsyncMock, killRunningBuildMock, executeApiRequestMock, execRemoteMock } = vi.hoisted(() => {
  const emitters = new Map<string, EventEmitter>()
  return {
    prismaMock: {
      script: { findUniqueOrThrow: vi.fn() },
      build: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
      apiRequest: { findUniqueOrThrow: vi.fn() },
      serverProfile: { findUniqueOrThrow: vi.fn() },
      remoteExecution: { create: vi.fn(), update: vi.fn(async () => ({})), findUniqueOrThrow: vi.fn() },
    },
    emitters,
    ensureBuildEmitterMock: vi.fn((buildId: string) => {
      const existing = emitters.get(buildId)
      if (existing) return existing
      const emitter = new EventEmitter()
      emitters.set(buildId, emitter)
      return emitter
    }),
    executeScriptAsyncMock: vi.fn(async () => { }),
    killRunningBuildMock: vi.fn(() => true),
    executeApiRequestMock: vi.fn(),
    execRemoteMock: vi.fn(async () => { }),
  }
})

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))
vi.mock('@/lib/scriptRunner', () => ({
  ensureBuildEmitter: ensureBuildEmitterMock,
  executeScriptAsync: executeScriptAsyncMock,
  killRunningBuild: killRunningBuildMock,
}))
vi.mock('@/lib/executeApiRequest', () => ({ executeApiRequest: executeApiRequestMock }))
vi.mock('@/lib/sshService', () => ({ execRemote: execRemoteMock }))

import { productionWorkflowAdapters } from '@/lib/workflows/runtimeAdapters'

beforeEach(() => {
  vi.clearAllMocks()
  emitters.clear()
})

describe('production workflow adapters', () => {
  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(productionWorkflowAdapters.runScript({ scriptId: 's' }, {}, controller.signal)).rejects.toThrow('Workflow node cancelled')
    await expect(productionWorkflowAdapters.runApiRequest({ requestId: 'r' }, {}, controller.signal)).rejects.toThrow('Workflow node cancelled')
    await expect(productionWorkflowAdapters.runRemoteCommand({ scriptId: 's', profileId: 'p' }, {}, controller.signal)).rejects.toThrow('Workflow node cancelled')
    expect(prismaMock.build.create).not.toHaveBeenCalled()
    expect(executeApiRequestMock).not.toHaveBeenCalled()
    expect(execRemoteMock).not.toHaveBeenCalled()
  })

  it('waits for build completion and returns success payload', async () => {
    prismaMock.script.findUniqueOrThrow.mockResolvedValue({ id: 's1', filename: 'a.py' })
    prismaMock.build.create.mockResolvedValue({ id: 'b1' })
    prismaMock.build.findUniqueOrThrow.mockResolvedValue({ id: 'b1', status: 'success', exitCode: 0 })
    let finish!: () => void
    executeScriptAsyncMock.mockImplementation(async () => { await new Promise<void>((resolve) => { finish = () => { ensureBuildEmitterMock('b1').emit('done'); resolve() } }) })
    const promise = productionWorkflowAdapters.runScript({ scriptId: 's1' }, {}, undefined)
    await vi.waitFor(() => expect(finish).toBeDefined())
    finish()
    await expect(promise).resolves.toEqual({ buildId: 'b1', exitCode: 0, status: 'success' })
    expect(executeScriptAsyncMock).toHaveBeenCalledWith('b1', expect.objectContaining({ id: 's1' }), {})
    expect(prismaMock.build.create).toHaveBeenCalledWith({ data: { scriptId: 's1', status: 'pending', triggeredBy: 'workflow' } })
  })

  it('kills the build and reports cancellation on abort mid-run', async () => {
    prismaMock.script.findUniqueOrThrow.mockResolvedValue({ id: 's2', filename: 'b.sh' })
    prismaMock.build.create.mockResolvedValue({ id: 'b2' })
    const controller = new AbortController()
    let release!: () => void
    executeScriptAsyncMock.mockImplementation(async () => { await new Promise<void>((resolve) => { release = () => { ensureBuildEmitterMock('b2').emit('done'); resolve() } }) })
    const promise = productionWorkflowAdapters.runScript({ scriptId: 's2' }, {}, controller.signal)
    await vi.waitFor(() => expect(release).toBeDefined())
    controller.abort()
    await vi.waitFor(() => expect(killRunningBuildMock).toHaveBeenCalledWith('b2'))
    release()
    await expect(promise).rejects.toThrow('Workflow node cancelled')
  })

  it('throws when the finished build did not succeed', async () => {
    prismaMock.script.findUniqueOrThrow.mockResolvedValue({ id: 's3', filename: 'c.py' })
    prismaMock.build.create.mockResolvedValue({ id: 'b3' })
    prismaMock.build.findUniqueOrThrow.mockResolvedValue({ id: 'b3', status: 'timeout', exitCode: 124 })
    let finish!: () => void
    executeScriptAsyncMock.mockImplementation(async () => { await new Promise<void>((resolve) => { finish = () => { ensureBuildEmitterMock('b3').emit('done'); resolve() } }) })
    const promise = productionWorkflowAdapters.runScript({ scriptId: 's3' }, {}, undefined)
    await vi.waitFor(() => expect(finish).toBeDefined())
    finish()
    await expect(promise).rejects.toThrow('Script failed with status: timeout')
  })

  it('passes the signal through to API requests and remote executions', async () => {
    const signal = new AbortController().signal
    prismaMock.apiRequest.findUniqueOrThrow.mockResolvedValue({ id: 'r1', collectionId: null, method: 'GET', url: 'https://example.com', headers: '[]', queryParams: '[]', variables: '[]', requestOptions: '{}', preRequestScript: null, testScript: null, responseMappings: '[]', bodyType: 'none', body: '', authType: 'none', authConfig: '{}' })
    executeApiRequestMock.mockResolvedValue({ ok: true, status: 200 })
    await productionWorkflowAdapters.runApiRequest({ requestId: 'r1' }, {}, signal)
    expect(executeApiRequestMock).toHaveBeenCalledWith(expect.objectContaining({ signal }))

    prismaMock.script.findUniqueOrThrow.mockResolvedValue({ id: 's4', filename: 'd.sh', name: 'd' })
    prismaMock.serverProfile.findUniqueOrThrow.mockResolvedValue({ id: 'p1', host: 'h', name: 'p' })
    prismaMock.remoteExecution.create.mockResolvedValue({ id: 're1' })
    prismaMock.remoteExecution.findUniqueOrThrow.mockResolvedValue({ id: 're1', status: 'success', exitCode: 0 })
    await productionWorkflowAdapters.runRemoteCommand({ scriptId: 's4', profileId: 'p1' }, {}, signal)
    expect(execRemoteMock).toHaveBeenCalledWith(expect.objectContaining({ signal }))
  })
})
