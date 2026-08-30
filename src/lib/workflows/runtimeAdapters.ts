import { prisma } from '@/lib/db'
import { executeApiRequest } from '@/lib/executeApiRequest'
import { ensureBuildEmitter, executeScriptAsync, killRunningBuild } from '@/lib/scriptRunner'
import { buildRemoteCommand } from '@/lib/executionSafety'
import { execRemote } from '@/lib/sshService'
import { dispatchNotificationToChannel } from '@/lib/notifications/dispatcher'
import type { WorkflowAdapters } from './adapters'
import type { AgentWorkflowService } from '@/lib/agents/service'

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

export function createProductionWorkflowAdapters(workspaceId = 'default', agentService?: AgentWorkflowService): WorkflowAdapters {
  return {
  async runScript(config, input, signal) {
    throwIfAborted(signal)
    const script = await prisma.script.findFirst({ where: { id: String(config.scriptId), workspaceId } })
    if (!script) throw new Error('Script not found')
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
    const request = await prisma.apiRequest.findFirst({ where: { id: String(config.requestId), workspaceId } })
    if (!request) throw new Error('API request not found')
    const result = await executeApiRequest({ workspaceId, requestId: request.id, collectionId: request.collectionId, method: request.method, url: request.url, headers: rows(request.headers), queryParams: rows(request.queryParams), variables: rows(request.variables), requestOptions: JSON.parse(request.requestOptions || '{}'), preRequestScript: request.preRequestScript, testScript: request.testScript, responseMappings: rows(request.responseMappings), bodyType: request.bodyType as 'none', body: request.body, authType: request.authType as 'none', authConfig: JSON.parse(request.authConfig || '{}'), signal })
    if (!result.ok) throw new Error(result.error)
    return result
  },
  async runRemoteCommand(config, input, signal) {
    throwIfAborted(signal)
    const script = await prisma.script.findFirst({ where: { id: String(config.scriptId), workspaceId } })
    const profile = await prisma.serverProfile.findFirst({ where: { id: String(config.profileId), workspaceId } })
    if (!script) throw new Error('Script not found')
    if (!profile) throw new Error('Server profile not found')
    const record = await prisma.remoteExecution.create({ data: { scriptId: script.id, profileId: profile.id, scriptName: script.name, profileName: profile.name, serverHost: profile.host, status: 'approved', triggeredBy: 'workflow', paramValues: JSON.stringify(input ?? {}) } })
    try {
      await execRemote({ profileId: profile.id, command: buildRemoteCommand(script.filename, typeof config.remotePath === 'string' ? config.remotePath : undefined, input as Record<string,string>), remoteExecId: record.id, workspaceId, signal })
    } finally {
      if (signal?.aborted) await prisma.remoteExecution.update({ where: { id: record.id }, data: { status: 'cancelled', finishedAt: new Date() } }).catch(() => {})
    }
    throwIfAborted(signal)
    const completed = await prisma.remoteExecution.findUniqueOrThrow({ where: { id: record.id } })
    if (completed.status !== 'success') throw new Error(`Remote execution failed: ${completed.status}`)
    return { remoteExecutionId: completed.id, exitCode: completed.exitCode }
  },
  async sendNotification(config) {
    const title = typeof config.title === 'string' ? config.title : 'Workflow notification'
    const body = typeof config.message === 'string' ? config.message : 'Workflow update'
    return dispatchNotificationToChannel(prisma, {
      workspaceId,
      channelId: typeof config.channelId === 'string' && config.channelId.trim() ? config.channelId : undefined,
      channelKind: typeof config.channel === 'string' ? config.channel : undefined,
      message: { title, body, deepLink: typeof config.deepLink === 'string' ? config.deepLink : undefined },
    })
  },
  async runAgent(config, input, signal) {
    if (!agentService) return { status: 'waiting_approval', output: { desktopHostRequired: true, message: 'Open ScriptManager Desktop to run this agent workflow node.' } }
    throwIfAborted(signal)
    const profileId = String(config.profileId ?? '')
    const profile = await prisma.agentProfile.findFirst({ where: { id: profileId, workspaceId }, include: { project: { select: { repositoryRoot: true } } } })
    if (!profile) throw new Error('Agent profile not found')
    if (config.provider !== undefined && config.provider !== profile.provider) throw new Error('Agent provider does not match the selected profile')
    const configuredCwd = typeof config.cwd === 'string' && config.cwd.trim() ? config.cwd.trim() : undefined
    const cwd = configuredCwd ?? profile.project?.repositoryRoot ?? process.cwd()
    const run = await agentService.launch({ profileId, prompt: String(config.prompt ?? ''), cwd, workspaceId, desktopHost: true, input: { workflowInput: input } })
    const completed = await agentService.waitForCompletion(run.id, signal)
    throwIfAborted(signal)
    if (['error', 'failed', 'interrupted'].includes(completed.status)) {
      let message = `Agent run ${completed.status}`
      try { message = JSON.parse(completed.errorJson ?? '{}').message ?? message } catch { /* keep the stable fallback */ }
      throw new Error(message)
    }
    let usage: unknown
    try { usage = completed.usageJson ? JSON.parse(completed.usageJson) : undefined } catch { usage = undefined }
    return { status: 'succeeded', output: { agentRunId: completed.id, provider: completed.provider, status: completed.status, messages: completed.messages, artifacts: completed.artifacts, ...(usage === undefined ? {} : { usage }) } }
  },
  }
}

export const productionWorkflowAdapters: WorkflowAdapters = createProductionWorkflowAdapters()
