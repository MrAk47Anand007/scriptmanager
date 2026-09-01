import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptResolvedFilePath } from '@/lib/scriptRunner'
import { buildLocalTerminalCommand } from '@/lib/executionSafety'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id } = await params
  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  let paramValues: Record<string, string> | undefined
  try {
    const body = await req.json()
    if (body?.paramValues && typeof body.paramValues === 'object') {
      paramValues = Object.fromEntries(
        Object.entries(body.paramValues).map(([key, value]) => [key, String(value)])
      )
    }
  } catch {
    // Allow empty body
  }

  const filePath = await getScriptResolvedFilePath(script)
  const command = buildLocalTerminalCommand({
    filePath,
    language: script.language,
    interpreter: script.interpreter,
    paramValues,
  })

  return NextResponse.json({ command })
}
