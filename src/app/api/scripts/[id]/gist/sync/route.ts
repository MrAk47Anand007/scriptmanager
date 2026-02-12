import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncScriptToGist } from '@/lib/gistService'
import { getScriptFilePath } from '@/lib/scriptRunner'
import fs from 'fs'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({
    where: { id },
    include: { collection: true }
  })

  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const filePath = getScriptFilePath(script.filename)
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
