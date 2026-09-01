import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createPluginRegistry } from '@/lib/plugins/registry'

export async function GET(request: Request) {
  const auth = await authorizeRequest(request, 'plugin', 'read'); if (auth.response) return auth.response
  return NextResponse.json(await createPluginRegistry(prisma).list(auth.context.workspaceId))
}

export async function POST(request: Request) {
  const auth = await authorizeRequest(request, 'plugin', 'manage'); if (auth.response) return auth.response
  try { return NextResponse.json(await createPluginRegistry(prisma).install({ ...(await request.json()), workspaceId: auth.context.workspaceId, actorId: auth.context.userId }), { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Plugin install failed' }, { status: 400 }) }
}
