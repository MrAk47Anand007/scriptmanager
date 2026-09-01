import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { createExecutionEventRepository } from '@/lib/execution/eventRepository'
import { createCorrelationId, createExecutionEvent } from '@/lib/execution/events'
import { parseGitAction, parseWorkspacePolicy } from '@/lib/git/policy'
import { runGit } from '@/lib/git/process'
import { createGitService } from '@/lib/git/service'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import type { GitAction } from '@/lib/git/types'

const readOnlyActions = new Set<GitAction['action']>(['status', 'diff', 'branches'])

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const readAuthorization = await authorizeRequest(request, 'git', 'read')
  if (readAuthorization.response) return readAuthorization.response

  let body: GitAction
  try {
    body = parseGitAction(await request.json())
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Git action is invalid' }, { status: 400 })
  }

  const authorization = readOnlyActions.has(body.action)
    ? readAuthorization
    : await authorizeRequest(request, 'git', 'run')
  if (authorization.response) return authorization.response

  const { id } = await params
  const project = await prisma.project.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  if (!project.repositoryRoot) return Response.json({ error: 'Project is not connected to a repository' }, { status: 409 })
  const actor = { type: 'user' as const, id: authorization.context.userId }
  const correlationId = createCorrelationId()
  const service = createGitService({
    run: runGit,
    audit: event => createExecutionEventRepository(prisma).append(createExecutionEvent({
      type: 'git.action', executionKind: 'git', correlationId, actor,
      target: { type: 'project', id: project.id, name: project.name }, data: { ...event },
    })),
    requestApproval: ({ action }) => createApprovalService(prisma).create({
      actorType: actor.type, actorId: actor.id, workspaceId: project.workspaceId, capability: `git.${action.action}`,
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
