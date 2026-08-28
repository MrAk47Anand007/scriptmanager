import { prisma } from '@/lib/db'
import { executeApiRequest } from '@/lib/executeApiRequest'
import { ensureBuildEmitter, executeScriptAsync, killRunningBuild } from '@/lib/scriptRunner'
import { buildRemoteCommand } from '@/lib/executionSafety'
import { execRemote } from '@/lib/sshService'
import type { WorkflowAdapters } from './adapters'

function rows(value: string) { try { return JSON.parse(value) } catch { return [] } }

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Workflow node cancelled')
}

async function waitForBuildDone(buildId: string, signal?: AbortSignal): Promise<void> {
  const emitter = ensureBuildEmitter(buildId)
  if (signal?.aborted) return
  await new Promise<void>((resolve) => {
    const onAbort = () => killRunningBuild(buildId)
    const onDone = () => {
      emitter.off('done', onDone)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    emitter.once('done', onDone)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export const productionWorkflowAdapters: WorkflowAdapters = {
  async runScript(config, input, signal) {
    throwIfAborted(signal)
    const script = await prisma.script.findUniqueOrThrow({ where: { id: String(config.scriptId) } })
    const build = await prisma.build.create({ data: { scriptId: script.id, status: 'pending', triggeredBy: 'workflow' } })
    const params = input && typeof input === 'object' ? input as Record<string, string> : undefined
    const done = waitForBuildDone(build.id, signal)
    try {
      await executeScriptAsync(build.id, script, params)
      await done
    } catch (error) {
      killRunningBuild(build.id)
      throw error
    }
    throwIfAborted(signal)
    const completed = await prisma.build.findUniqueOrThrow({ where: { id: build.id } })
    if (completed.status !== 'success') throw new Error(`Script failed with status: ${completed.status}`)
    return { buildId: completed.id, exitCode: completed.exitCode, status: completed.status }
  },
  async runApiRequest(config, input, signal) {
    throwIfAborted(signal)
    const request = await prisma.apiRequest.findUniqueOrThrow({ where: { id: String(config.requestId) } })
    const result = await executeApiRequest({ workspaceId: 'default', requestId: request.id, collectionId: request.collectionId, method: request.method, url: request.url, headers: rows(request.headers), queryParams: rows(request.queryParams), variables: rows(request.variables), requestOptions: JSON.parse(request.requestOptions || '{}'), preRequestScript: request.preRequestScript, testScript: request.testScript, responseMappings: rows(request.responseMappings), bodyType: request.bodyType as 'none', body: request.body, authType: request.authType as 'none', authConfig: JSON.parse(request.authConfig || '{}'), signal })
    if (!result.ok) throw new Error(result.error)
    return result
  },
  async runRemoteCommand(config, input, signal) {
    throwIfAborted(signal)
    const script = await prisma.script.findUniqueOrThrow({ where: { id: String(config.scriptId) } })
    const profile = await prisma.serverProfile.findUniqueOrThrow({ where: { id: String(config.profileId) } })
    const record = await prisma.remoteExecution.create({ data: { scriptId: script.id, profileId: profile.id, scriptName: script.name, profileName: profile.name, serverHost: profile.host, status: 'approved', triggeredBy: 'workflow', paramValues: JSON.stringify(input ?? {}) } })
    try {
      await execRemote({ profileId: profile.id, command: buildRemoteCommand(script.filename, typeof config.remotePath === 'string' ? config.remotePath : undefined, input as Record<string,string>), remoteExecId: record.id, signal })
    } finally {
      if (signal?.aborted) await prisma.remoteExecution.update({ where: { id: record.id }, data: { status: 'cancelled', finishedAt: new Date() } }).catch(() => {})
    }
    throwIfAborted(signal)
    const completed = await prisma.remoteExecution.findUniqueOrThrow({ where: { id: record.id } })
    if (completed.status !== 'success') throw new Error(`Remote execution failed: ${completed.status}`)
    return { remoteExecutionId: completed.id, exitCode: completed.exitCode }
  },
  async sendNotification(config) { return { queued: true, channel: config.channel, message: config.message } },
  async runAgent() {
    return { status: 'waiting_approval', output: { desktopHostRequired: true, message: 'Open ScriptManager Desktop to run this agent workflow node.' } }
  },
}
