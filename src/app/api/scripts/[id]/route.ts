import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptFilePath } from '@/lib/scriptRunner'
import fs from 'fs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const script = await prisma.script.findUnique({ where: { id } })

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const filePath = await getScriptFilePath(script.filename)
  let content = ''
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8')
  }

  return NextResponse.json({
    id: script.id,
    name: script.name,
    filename: script.filename,
    content,
    language: script.language,
    interpreter: script.interpreter,
    created_at: script.createdAt.toISOString(),
    updated_at: script.updatedAt.toISOString(),
  })
}
