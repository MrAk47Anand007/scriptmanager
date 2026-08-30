import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

type Params = Promise<{ id: string }>

// GET /api/scripts/[id]/tags — list tags for a script
export async function GET(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id } = await params
  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  const scriptTags = await prisma.scriptTag.findMany({
    where: { scriptId: id },
    include: { tag: true },
    orderBy: { tag: { name: 'asc' } },
  })
  return NextResponse.json(
    scriptTags.map((st) => ({
      id: st.tag.id,
      name: st.tag.name,
      color: st.tag.color,
    }))
  )
}

// POST /api/scripts/[id]/tags — add a tag to a script (creates tag if needed)
export async function POST(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id: scriptId } = await params
  const body = await req.json()
  const tagName = (body.name ?? '').trim().toLowerCase()
  const color = body.color ?? '#6366f1'

  if (!tagName) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 })
  }

  const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Upsert tag
  const tag = await prisma.tag.upsert({
    where: { name: tagName },
    update: {},
    create: { name: tagName, color },
  })

  // Create join (ignore if already exists)
  await prisma.scriptTag.upsert({
    where: { scriptId_tagId: { scriptId, tagId: tag.id } },
    update: {},
    create: { scriptId, tagId: tag.id },
  })

  return NextResponse.json({ id: tag.id, name: tag.name, color: tag.color })
}

// DELETE /api/scripts/[id]/tags?tagId=... — remove a tag from a script
export async function DELETE(
  req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id: scriptId } = await params
  const { searchParams } = new URL(req.url)
  const tagId = searchParams.get('tagId')

  if (!tagId) {
    return NextResponse.json({ error: 'tagId query param required' }, { status: 400 })
  }

  const script = await prisma.script.findFirst({ where: { id: scriptId, workspaceId: authorization.context.workspaceId }, select: { id: true } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  await prisma.scriptTag.deleteMany({ where: { scriptId, tagId } })
  return NextResponse.json({ message: 'Tag removed' })
}
