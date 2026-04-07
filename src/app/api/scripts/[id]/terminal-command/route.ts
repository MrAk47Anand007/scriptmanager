import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptResolvedFilePath } from '@/lib/scriptRunner'
import { buildLocalTerminalCommand } from '@/lib/executionSafety'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const script = await prisma.script.findUnique({ where: { id } })

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
