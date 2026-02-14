import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureScriptsDirExists, getScriptFilePath } from '@/lib/scriptRunner'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

interface ScriptImportItem {
  name: string
  description?: string
  language?: string
  interpreter?: string | null
  content?: string
  parameters?: unknown[]
  tags?: { name: string; color?: string }[]
}

interface ImportPayload {
  _export_version?: number
  scripts?: ScriptImportItem[]
  // Allow single-script import too
  name?: string
  content?: string
  language?: string
}

// POST /api/scripts/import — import one or more scripts from JSON
export async function POST(req: Request) {
  let body: ImportPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Normalise: accept either a bundle ({ scripts: [...] }) or a single script
  let toImport: ScriptImportItem[]
  if (Array.isArray(body.scripts)) {
    toImport = body.scripts
  } else if (body.name) {
    toImport = [body as ScriptImportItem]
  } else {
    return NextResponse.json({ error: 'No scripts to import' }, { status: 400 })
  }

  await ensureScriptsDirExists()

  const results: { name: string; id: string; status: 'created' | 'skipped' }[] = []

  for (const item of toImport) {
    if (!item.name?.trim()) continue

    // Deduplicate: if a script with this name already exists, skip it
    const existing = await prisma.script.findUnique({ where: { name: item.name.trim() } })
    if (existing) {
      results.push({ name: item.name.trim(), id: existing.id, status: 'skipped' })
      continue
    }

    const language = item.language ?? 'python'
    const filename = item.name.endsWith('.py') || item.name.endsWith('.js') || item.name.endsWith('.sh')
      ? item.name
      : `${item.name}.py`

    const content = item.content ?? '# Imported script\n'
    const filePath = await getScriptFilePath(filename)
    fs.writeFileSync(filePath, content, 'utf8')

    let parametersJson = '[]'
    if (Array.isArray(item.parameters)) {
      try { parametersJson = JSON.stringify(item.parameters) } catch { /* */ }
    }

    const script = await prisma.script.create({
      data: {
        name: item.name.trim(),
        filename,
        description: item.description ?? '',
        language,
        interpreter: language === 'custom' ? (item.interpreter ?? null) : null,
        parameters: parametersJson,
        webhookToken: uuidv4().replace(/-/g, ''),
      },
    })

    // Re-attach tags if any
    if (Array.isArray(item.tags)) {
      for (const tagInfo of item.tags) {
        if (!tagInfo.name) continue
        const tagName = tagInfo.name.toLowerCase()
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName, color: tagInfo.color ?? '#6366f1' },
        })
        await prisma.scriptTag.upsert({
          where: { scriptId_tagId: { scriptId: script.id, tagId: tag.id } },
          update: {},
          create: { scriptId: script.id, tagId: tag.id },
        })
      }
    }

    results.push({ name: script.name, id: script.id, status: 'created' })
  }

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status === 'skipped').length

  return NextResponse.json({ message: `Imported ${created} script(s), skipped ${skipped} duplicate(s)`, results })
}
