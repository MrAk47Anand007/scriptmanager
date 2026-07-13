import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { createExecutionEventRepository } from '@/lib/execution/eventRepository'
import { createCorrelationId, createExecutionEvent } from '@/lib/execution/events'
import { parseWorkspacePolicy } from '@/lib/git/policy'
import { runGit } from '@/lib/git/process'
import { createGitService } from '@/lib/git/service'
import type { GitAction } from '@/lib/git/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const project = await prisma.project.findUnique({ where: { id: (await params).id } })
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  if (!project.repositoryRoot) return Response.json({ error: 'Project is not connected to a repository' }, { status: 409 })
  const body = await request.json() as GitAction & { actor_type?: 'user' | 'agent'; actor_id?: string }
  const actor = { type: body.actor_type ?? 'user', id: body.actor_id ?? 'admin' } as const
  const correlationId = createCorrelationId()
  const service = createGitService({
    run: runGit,
    audit: event => createExecutionEventRepository(prisma).append(createExecutionEvent({
      type: 'git.action', executionKind: 'git', correlationId, actor,
      target: { type: 'project', id: project.id, name: project.name }, data: { ...event },
    })),
    requestApproval: ({ action }) => createApprovalService(prisma).create({
      actorType: actor.type, actorId: actor.id, workspaceId: project.id, capability: `git.${action.action}`,
      operation: action.action, resource: project.repositoryRoot!, risk: action.force || action.action === 'clean' ? 'critical' : 'high',
      reason: 'Protected Git operation', preview: action, protectedAction: true, correlationId,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    }),
  })
  try {
    const result = await service.execute({ projectId: project.id, name: project.name, root: project.repositoryRoot,
      defaultBranch: project.defaultBranch, remoteUrl: project.remoteUrl, policy: parseWorkspacePolicy(project.workspacePolicy) }, body, actor)
    return Response.json(result, { status: result.kind === 'approval' ? 202 : 200 })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Git operation failed' }, { status: 400 }) }
}
