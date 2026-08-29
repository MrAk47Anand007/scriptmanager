import { prisma } from '@/lib/db'
import { buildRemoteCommand } from '@/lib/executionSafety'
import type { TrustedActorContext } from '@/lib/runtime/trustedContext'
import { execRemote } from '@/lib/sshService'

function ensureWorkspaceAccess(actor: TrustedActorContext, workspaceId: string) {
  if (actor.workspaceId !== workspaceId) {
    throw new Error('Remote execution workspace does not match')
  }
}

export async function approveRemoteExecution(id: string, actor: TrustedActorContext, correlationId: string) {
  const execution = await prisma.remoteExecution.findUnique({
    where: { id },
    include: { profile: true },
  })
  if (!execution) {
    throw new Error('Remote execution not found')
  }
  if (execution.status !== 'pending_approval') {
    throw new Error(`Cannot approve execution with status: ${execution.status}`)
  }

  ensureWorkspaceAccess(actor, execution.profile.workspaceId)

  const script = await prisma.script.findFirst({ where: { id: execution.scriptId, workspaceId: execution.profile.workspaceId } })
  if (!script) {
    throw new Error('Script not found')
  }

  await prisma.remoteExecution.update({
    where: { id },
    data: {
      status: 'approved',
      approvedBy: actor.actorId,
      approvedAt: new Date(),
    },
  })

  const paramValues = execution.paramValues ? JSON.parse(execution.paramValues) : {}
  const command = buildRemoteCommand(script.filename, execution.remotePath ?? undefined, paramValues as Record<string, string>)

  void execRemote({
    profileId: execution.profileId,
    command,
    remoteExecId: id,
    context: { correlationId, actor: { type: 'user', id: actor.actorId }, trigger: 'remote' },
  }).catch(console.error)

  return { ok: true, remoteExecId: id }
}

export async function rejectRemoteExecution(id: string, actor: TrustedActorContext) {
  const execution = await prisma.remoteExecution.findUnique({
    where: { id },
    include: { profile: true },
  })
  if (!execution) {
    throw new Error('Remote execution not found')
  }
  if (execution.status !== 'pending_approval') {
    throw new Error(`Cannot reject execution with status: ${execution.status}`)
  }

  ensureWorkspaceAccess(actor, execution.profile.workspaceId)

  await prisma.remoteExecution.update({
    where: { id },
    data: {
      status: 'rejected',
      finishedAt: new Date(),
    },
  })

  return { ok: true, remoteExecId: id }
}
