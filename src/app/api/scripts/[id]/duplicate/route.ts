import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureScriptsDirExists, getScriptFilePath, getScriptResolvedFilePath } from '@/lib/scriptRunner'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { sanitizeScriptFilename } from '@/lib/executionSafety'

// POST /api/scripts/[id]/duplicate — create a copy of a script
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const original = await prisma.script.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } }, collection: true }
  })

  if (!original) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  await ensureScriptsDirExists()

  // Read original file content
  const originalPath = await getScriptResolvedFilePath(original)
  let content = '# Duplicated script\n'
  try {
    if (fs.existsSync(originalPath)) {
      content = fs.readFileSync(originalPath, 'utf8')
    }
  } catch {
    // Fall back to default content
  }

  // Generate a unique name: "{original} (copy)", then "{original} (copy 2)", etc.
  const baseName = `${original.name} (copy)`
  let newName = baseName
  let counter = 2
  while (await prisma.script.findFirst({ where: { name: newName } })) {
    newName = `${baseName} ${counter++}`
  }

  // Derive filename from the new name
  const ext = original.filename.includes('.') ? `.${original.filename.split('.').pop()}` : '.py'
  const newFilename = sanitizeScriptFilename(newName, ext)

  let newPath = await getScriptFilePath(newFilename)
  let sourcePath: string | null = null
  if (original.collection?.folderPath) {
    newPath = path.join(original.collection.folderPath, newFilename)
    sourcePath = newPath
  }

  if (fs.existsSync(newPath)) {
    return NextResponse.json({ error: 'A file with the duplicate name already exists' }, { status: 409 })
  }
  fs.writeFileSync(newPath, content, 'utf8')

  const copy = await prisma.script.create({
    data: {
      name: newName,
      filename: newFilename,
      description: original.description,
      language: original.language,
      interpreter: original.interpreter,
      parameters: original.parameters,
      collectionId: original.collectionId,
      sourcePath,
      timeoutMs: original.timeoutMs,
      // New webhook token — don't share the original's token
      webhookToken: uuidv4().replace(/-/g, ''),
      // Don't copy Gist link or webhook secret
    }
  })

  // Re-attach tags
  for (const st of original.tags) {
    await prisma.scriptTag.create({
      data: { scriptId: copy.id, tagId: st.tagId }
    })
  }

  return NextResponse.json({
    id: copy.id,
    name: copy.name,
    filename: copy.filename,
    description: copy.description,
    language: copy.language,
    interpreter: copy.interpreter,
    parameters: (() => { try { return JSON.parse(copy.parameters ?? '[]') } catch { return [] } })(),
    created_at: copy.createdAt.toISOString(),
    updated_at: copy.updatedAt.toISOString(),
    last_run: copy.lastRun?.toISOString() ?? null,
    webhook_token: copy.webhookToken,
    schedule_cron: copy.scheduleCron,
    schedule_enabled: copy.scheduleEnabled,
    collection_id: copy.collectionId,
    gist_id: null,
    gist_url: null,
    sync_to_gist: false,
    source_path: copy.sourcePath,
    tags: original.tags.map(st => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color })),
    timeout_ms: copy.timeoutMs,
  })
}
