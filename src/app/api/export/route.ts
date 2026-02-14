import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptFilePath } from '@/lib/scriptRunner'
import fs from 'fs'

// GET /api/export — export all scripts as a JSON bundle
export async function GET() {
  const scripts = await prisma.script.findMany({
    orderBy: { name: 'asc' },
    include: { tags: { include: { tag: true } } },
  })

  const exported = await Promise.all(
    scripts.map(async (script) => {
      let content = ''
      try {
        const filePath = await getScriptFilePath(script.filename)
        content = fs.readFileSync(filePath, 'utf8')
      } catch {
        // File missing
      }

      return {
        name: script.name,
        description: script.description,
        language: script.language,
        interpreter: script.interpreter,
        content,
        parameters: (() => {
          try { return JSON.parse(script.parameters ?? '[]') } catch { return [] }
        })(),
        tags: script.tags.map(st => ({ name: st.tag.name, color: st.tag.color })),
        created_at: script.createdAt.toISOString(),
      }
    })
  )

  const bundle = {
    _export_version: 1,
    exported_at: new Date().toISOString(),
    scripts: exported,
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="scriptmanager-export.json"',
    },
  })
}
