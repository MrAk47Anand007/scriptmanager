import { prisma } from '@/lib/db'
import { cleanupObservabilityData } from '@/lib/observability/retention'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(request: Request) {
  const authorization = await authorizeRequest(request, 'audit', 'manage')
  if (authorization.response) return authorization.response
  const body = await request.json().catch(() => ({})) as { eventDays?: number }
  return Response.json(await cleanupObservabilityData(prisma, body))
}
