import { prisma } from '@/lib/db'
import { executeApiRequest } from '@/lib/executeApiRequest'
import { executeScriptAsync } from '@/lib/scriptRunner'
import { buildRemoteCommand } from '@/lib/executionSafety'
import { execRemote } from '@/lib/sshService'
import type { WorkflowAdapters } from './adapters'
import { createWorkflowRepository } from './repository'
import { runClaimedWorkflow } from './worker'

function rows(value: string) { try { return JSON.parse(value) } catch { return [] } }

export const productionWorkflowAdapters: WorkflowAdapters = {
  async runScript(config, input) {
    const script = await prisma.script.findUniqueOrThrow({ where: { id: String(config.scriptId) } })
    const build = await prisma.build.create({ data: { scriptId: script.id, status: 'pending', triggeredBy: 'workflow' } })
    const params = input && typeof input === 'object' ? input as Record<string, string> : undefined
    await executeScriptAsync(build.id, script, params)
    const completed = await prisma.build.findUniqueOrThrow({ where: { id: build.id } })
    if (completed.status !== 'success') throw new Error(`Script failed with status: ${completed.status}`)
    return { buildId: completed.id, exitCode: completed.exitCode, status: completed.status }
  },
  async runApiRequest(config) {
    const request = await prisma.apiRequest.findUniqueOrThrow({ where: { id: String(config.requestId) } })
    const result = await executeApiRequest({ requestId: request.id, collectionId: request.collectionId, method: request.method, url: request.url, headers: rows(request.headers), queryParams: rows(request.queryParams), variables: rows(request.variables), requestOptions: JSON.parse(request.requestOptions || '{}'), preRequestScript: request.preRequestScript, testScript: request.testScript, responseMappings: rows(request.responseMappings), bodyType: request.bodyType as 'none', body: request.body, authType: request.authType as 'none', authConfig: JSON.parse(request.authConfig || '{}') })
    if (!result.ok) throw new Error(result.error)
    return result
  },
  async runRemoteCommand(config, input) {
    const script = await prisma.script.findUniqueOrThrow({ where: { id: String(config.scriptId) } })
    const profile = await prisma.serverProfile.findUniqueOrThrow({ where: { id: String(config.profileId) } })
    const record = await prisma.remoteExecution.create({ data: { scriptId: script.id, profileId: profile.id, scriptName: script.name, profileName: profile.name, serverHost: profile.host, status: 'approved', triggeredBy: 'workflow', paramValues: JSON.stringify(input ?? {}) } })
    await execRemote({ profileId: profile.id, command: buildRemoteCommand(script.filename, typeof config.remotePath === 'string' ? config.remotePath : undefined, input as Record<string,string>), remoteExecId: record.id })
    const completed = await prisma.remoteExecution.findUniqueOrThrow({ where: { id: record.id } })
    if (completed.status !== 'success') throw new Error(`Remote execution failed: ${completed.status}`)
    return { remoteExecutionId: completed.id, exitCode: completed.exitCode }
  },
  async sendNotification(config) { return { queued: true, channel: config.channel, message: config.message } },
}

export async function processWorkflowQueueOnce(workerId = `server-${process.pid}`) {
  const repository = createWorkflowRepository(prisma)
  const claimed = await repository.claimNextRun(workerId)
  if (claimed) await runClaimedWorkflow(claimed, repository, productionWorkflowAdapters)
  return claimed?.id ?? null
}
