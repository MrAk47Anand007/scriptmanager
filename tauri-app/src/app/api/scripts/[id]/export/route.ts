import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptResolvedFilePath } from '@/lib/scriptRunner'
import fs from 'fs'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

type Params = Promise<{ id: string }>

export async function GET(
  _req: Request,
  { params }: { params: Params }
) {
  const authorization = await authorizeRequest(_req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { id } = await params

  const script = await prisma.script.findFirst({
    where: { id, workspaceId: authorization.context.workspaceId },
    include: { tags: { include: { tag: true } } },
  })

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Read script file content
  let content = ''
  try {
    const filePath = await getScriptResolvedFilePath(script)
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    // File missing — export with empty content
  }

  const exportData = {
    _export_version: 1,
    exported_at: new Date().toISOString(),
    name: script.name,
    description: script.description,
    language: script.language,
    interpreter: script.interpreter,
    content,
    parameters: (() => {
      try { return JSON.parse(script.parameters ?? '[]') } catch { return [] }
    })(),
    tags: script.tags.map(st => ({ name: st.tag.name, color: st.tag.color })),
  }

  const filename = `${script.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.scriptmanager.json`

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
