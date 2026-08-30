import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthenticatedSessionToken, SESSION_COOKIE } from '@/lib/session'
import { prisma } from '@/lib/db'
import { resolveBearerTokenContext, resolveRequestContext, resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { authorize } from '@/lib/rbac/authorization'
import type { RbacAction, RbacResource } from '@/lib/rbac/catalog'

export const config = {
  // Match everything except Next.js internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  // Run in Node.js runtime, not Edge, so we can use node:crypto
  runtime: 'nodejs',
}

// Public paths that do not require authentication
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhooks/',  // Webhook triggers stay unauthenticated
  '/api/workflow-webhooks/',  // HMAC signature is the authentication
  '/_next/',
  '/favicon.ico',
]

function deniedResponse(reason: string, permission?: string, status?: number) {
  return NextResponse.json(
    permission ? { error: reason, permission } : { error: reason },
    { status: status ?? (reason === 'unauthenticated' ? 401 : 403) },
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  // Check for a valid session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (isAuthenticatedSessionToken(token)) {
    if (pathname.startsWith('/api/')) {
      const requirement = apiRequirement(pathname, request.method)
      if (requirement) {
        const context = await resolveRequestContext(request, prisma)
        const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId') ?? undefined
        const resourceWorkspaceId = await findResourceWorkspace(pathname, requirement.resource)
        const decision = authorize(context, requirement.resource, requirement.action, resourceWorkspaceId ?? requestedWorkspaceId)
        if (!decision.allowed) return deniedResponse(decision.reason, decision.permission)
        const headers = new Headers(request.headers)
        headers.set('x-scriptmanager-workspace-id', context!.workspaceId)
        headers.set('x-scriptmanager-user-id', context!.userId)
        return NextResponse.next({ request: { headers } })
      }
    }
    return NextResponse.next()
  }

  // Allow API clients to authenticate with a bearer token
  if (pathname.startsWith('/api/')) {
    const requirement = apiRequirement(pathname, request.method)
    const bearerContext = await resolveBearerTokenContext(request, prisma)
    if (bearerContext) {
      if (!requirement) {
        return NextResponse.next()
      }

      const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId') ?? undefined
      const resourceWorkspaceId = await findResourceWorkspace(pathname, requirement.resource)
      const decision = authorize(
        {
          userId: bearerContext.actorId,
          workspaceId: bearerContext.workspaceId,
          membershipId: bearerContext.membershipId,
          roleKey: bearerContext.roleKey,
          permissions: bearerContext.permissions,
          sessionId: bearerContext.sessionId,
        },
        requirement.resource,
        requirement.action,
        resourceWorkspaceId ?? requestedWorkspaceId,
      )
      if (!decision.allowed) {
        return deniedResponse(decision.reason, decision.permission)
      }

      const headers = new Headers(request.headers)
      headers.set('x-scriptmanager-workspace-id', bearerContext.workspaceId)
      headers.set('x-scriptmanager-user-id', bearerContext.actorId)
      return NextResponse.next({ request: { headers } })
    }
  }

  // API routes return 401 JSON instead of redirecting
  if (pathname.startsWith('/api/')) {
    return deniedResponse('Unauthorized', undefined, 401)
  }

  // Redirect browser requests to login page
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

async function findResourceWorkspace(pathname: string, resource: RbacResource): Promise<string | undefined> {
  const parts = pathname.split('/').filter(Boolean)
  const idAfter = (segment: string) => { const index = parts.indexOf(segment); return index >= 0 ? parts[index + 1] : undefined }
  if (resource === 'script') {
    const id = idAfter('scripts'); if (id && id !== 'import' && id !== 'import-folder' && id !== 'open-folder') return (await prisma.script.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
  }
  if (resource === 'workflow') {
    const id = idAfter('workflows'); if (id) return (await prisma.workflow.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
    const runId = idAfter('workflow-runs'); if (runId) return (await prisma.workflowRun.findUnique({ where: { id: runId }, include: { workflow: { select: { workspaceId: true } } } }))?.workflow.workspaceId
  }
  if (resource === 'git') {
    const id = idAfter('projects'); if (id) return (await prisma.project.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
  }
  if (resource === 'secret') {
    const id = idAfter('secrets'); if (id) return (await prisma.secret.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
  }
  if (resource === 'approval') {
    const id = idAfter('approvals'); if (id) return (await prisma.approvalRequest.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
  }
  if (resource === 'agent') {
    const runId = idAfter('runs'); if (runId) return (await prisma.agentRun.findUnique({ where: { id: runId }, select: { workspaceId: true } }))?.workspaceId
  }
  if (resource === 'ops') {
    const id = idAfter('server-profiles'); if (id) return (await prisma.serverProfile.findUnique({ where: { id }, select: { workspaceId: true } }))?.workspaceId
  }
  return undefined
}

function apiRequirement(pathname: string, method: string): { resource: RbacResource; action: RbacAction } | null {
  const resource = pathname.startsWith('/api/scripts') ? 'script'
    : pathname.startsWith('/api/workflow-runs') ? 'workflow'
      : pathname.startsWith('/api/workflows') ? 'workflow'
      : pathname.startsWith('/api/secrets') ? 'secret'
        : pathname.startsWith('/api/agent') ? 'agent'
          : pathname.startsWith('/api/approvals') ? 'approval'
            : pathname.startsWith('/api/ops') ? 'ops'
              : pathname.includes('/git') ? 'git'
                  : pathname.startsWith('/api/api-') || pathname.startsWith('/api/proxy-request') ? 'api'
                  : pathname.startsWith('/api/notifications') ? 'notification'
                  : pathname.startsWith('/api/workspaces/current/memberships') || pathname.startsWith('/api/workspaces/current/invitations') ? 'member'
                    : pathname.startsWith('/api/workspaces/current/roles') ? 'role'
                  : pathname.startsWith('/api/workspaces/current/sessions') || pathname.startsWith('/api/workspaces/current/grants') ? 'session'
                    : pathname.startsWith('/api/workspaces/current/audit') ? 'audit' : null
  if (!resource) return null
  const action: RbacAction = method === 'GET' || method === 'HEAD' ? 'read'
    : pathname.includes('/decision') || pathname.includes('/approve') ? 'approve'
      : pathname.includes('/run') || pathname.includes('/execute') || pathname.includes('/retry-node') || pathname.includes('/cancel') ? 'run'
        : pathname.includes('/reveal') ? 'reveal'
          : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update'
  return { resource, action }
}
