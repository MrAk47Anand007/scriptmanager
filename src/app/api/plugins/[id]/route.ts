import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createPluginRegistry } from '@/lib/plugins/registry'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, 'plugin', 'manage'); if (auth.response) return auth.response
  const { id } = await params; const body = await request.json(); const registry = createPluginRegistry(prisma)
  try {
    const result = body.action === 'trust' ? await registry.trust(auth.context.workspaceId, id) : body.action === 'enable' ? await registry.enable(auth.context.workspaceId, id) : body.action === 'disable' ? await registry.disable(auth.context.workspaceId, id) : body.action === 'health' ? await registry.checkHealth(auth.context.workspaceId, id) : body.action === 'settings' ? await registry.updateSettings(auth.context.workspaceId, id, body.settings) : null
    if (!result) return NextResponse.json({ error: 'Unsupported plugin action' }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Plugin update failed' }, { status: 400 }) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, 'plugin', 'manage'); if (auth.response) return auth.response
  try { await createPluginRegistry(prisma).uninstall(auth.context.workspaceId, (await params).id); return new NextResponse(null, { status: 204 }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Plugin uninstall failed' }, { status: 404 }) }
}
