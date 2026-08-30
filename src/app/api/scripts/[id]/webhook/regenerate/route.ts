import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const newToken = uuidv4().replace(/-/g, '')

  await prisma.script.update({
    where: { id },
    data: { webhookToken: newToken }
  })

  return NextResponse.json({ webhook_token: newToken })
}
