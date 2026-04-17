import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureScriptsDirExists, getScriptFilePath } from '@/lib/scriptRunner'
import { sanitizeScriptFilename } from '@/lib/executionSafety'
import { inferScriptLanguage, isSupportedScriptFile } from '@/lib/linkedFolders'
import { cache } from '@/lib/cache'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

type FolderImportFile = {
  relativePath: string
  content: string
}

async function buildUniqueScriptName(baseName: string): Promise<string> {
  let candidate = baseName
  let suffix = 2

  while (await prisma.script.findFirst({ where: { name: candidate } })) {
    candidate = `${baseName} (${suffix++})`
  }

  return candidate
}

export async function POST(req: Request) {
  let body: {
    mode?: 'temporary' | 'collection'
    collectionName?: string
    folderName?: string
    files?: FolderImportFile[]
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const files = Array.isArray(body.files) ? body.files : []
  const validFiles = files.filter((file) => file.relativePath && isSupportedScriptFile(file.relativePath))

  if (validFiles.length === 0) {
    return NextResponse.json({ error: 'No supported script files were selected' }, { status: 400 })
  }

  await ensureScriptsDirExists()
  await cache.del('all_scripts')

  if ((body.mode ?? 'temporary') === 'temporary') {
    const tempCollections = await prisma.collection.findMany({
      where: { isTemporary: true },
      select: { id: true },
    })

    if (tempCollections.length > 0) {
      const tempIds = tempCollections.map((collection) => collection.id)
      await prisma.script.deleteMany({ where: { collectionId: { in: tempIds } } })
      await prisma.collection.deleteMany({ where: { id: { in: tempIds } } })
    }
  }

  const folderName = body.folderName?.trim() || 'Imported Folder'
  const collection = await prisma.collection.create({
    data: {
      name: (body.collectionName?.trim() || folderName) + ((body.mode ?? 'temporary') === 'temporary' ? ' (Temporary)' : ''),
      isTemporary: (body.mode ?? 'temporary') === 'temporary',
    },
  })

  const scripts: Array<{ id: string; name: string }> = []

  for (const file of validFiles) {
    const baseName = `${folderName}/${file.relativePath.replace(/\\/g, '/')}`
    const name = await buildUniqueScriptName(baseName)
    const ext = path.extname(file.relativePath) || '.txt'
    const filename = sanitizeScriptFilename(name, ext)
    const filePath = await getScriptFilePath(filename)
    fs.writeFileSync(filePath, file.content, 'utf8')

    const script = await prisma.script.create({
      data: {
        name,
        filename,
        language: inferScriptLanguage(file.relativePath),
        collectionId: collection.id,
        webhookToken: uuidv4().replace(/-/g, ''),
      },
    })

    scripts.push({ id: script.id, name: script.name })
  }

  return NextResponse.json({
    collection: {
      id: collection.id,
      name: collection.name,
      folder_path: null,
      is_temporary: collection.isTemporary,
    },
    scripts,
    imported_count: scripts.length,
  })
}
