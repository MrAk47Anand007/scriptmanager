import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createPluginRegistry } from '@/lib/plugins/registry'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request, 'plugin', 'read'); if (auth.response) return auth.response
  try { const row = await createPluginRegistry(prisma).get(auth.context.workspaceId, (await params).id); const manifest = JSON.parse(row.package.manifestJson); return NextResponse.json({ currentVersion: manifest.version, updateUrl: manifest.updateUrl ?? null, checkSupported: Boolean(manifest.updateUrl) }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Plugin not found' }, { status: 404 }) }
}
