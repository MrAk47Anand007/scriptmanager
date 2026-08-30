import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncScriptToGist } from '@/lib/gistService'
import { getScriptResolvedFilePath } from '@/lib/scriptRunner'
import fs from 'fs'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'run')
  if (authorization.response) return authorization.response
  const { id } = await params

  const script = await prisma.script.findFirst({
    where: { id, workspaceId: authorization.context.workspaceId },
    include: { collection: true }
  })

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const filePath = await getScriptResolvedFilePath(script)
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Script file not found on disk' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath, 'utf8')

  try {
    const result = await syncScriptToGist(script, content)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
