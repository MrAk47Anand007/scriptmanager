import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { buildLinkedScriptName, getFolderDisplayName, inferScriptLanguage, listScriptFiles } from '@/lib/linkedFolders'
import { cache } from '@/lib/cache'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

async function buildUniqueScriptName(baseName: string, currentSourcePath: string, workspaceId: string): Promise<string> {
  let candidate = baseName
  let suffix = 2

  while (true) {
    const existing = await prisma.script.findFirst({ where: { name: candidate, workspaceId } })
    if (!existing || existing.sourcePath === currentSourcePath) {
      return candidate
    }

    candidate = `${baseName} (${suffix++})`
  }
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'script', 'create')
  if (authorization.response) return authorization.response
  const workspaceId = authorization.context.workspaceId
  let body: {
    folderPath?: string
    mode?: 'temporary' | 'collection'
    collectionName?: string
    runtime_preset?: 'general' | 'python' | 'node' | 'shell' | 'powershell'
    python_toolchain_enabled?: boolean
    python_venv_path?: string | null
    python_interpreter_path?: string | null
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const folderPath = body.folderPath?.trim()
  const mode = body.mode ?? 'temporary'
  if (!folderPath) {
    return NextResponse.json({ error: 'Folder path is required' }, { status: 400 })
  }

  const resolvedFolderPath = path.resolve(folderPath)
  if (!fs.existsSync(resolvedFolderPath) || !fs.statSync(resolvedFolderPath).isDirectory()) {
    return NextResponse.json({ error: 'Selected folder does not exist' }, { status: 400 })
  }

  const files = listScriptFiles(resolvedFolderPath)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No supported script files found in that folder' }, { status: 400 })
  }

  await cache.del(`all_scripts:${workspaceId}`)

  if (mode === 'temporary') {
    const tempCollections = await prisma.collection.findMany({
      where: { isTemporary: true, folderPath: { not: null }, workspaceId },
      select: { id: true },
    })

    if (tempCollections.length > 0) {
      const tempIds = tempCollections.map((collection) => collection.id)
      await prisma.script.deleteMany({ where: { collectionId: { in: tempIds } } })
      await prisma.collection.deleteMany({ where: { id: { in: tempIds } } })
    }
  }

  let collection = mode === 'collection'
    ? await prisma.collection.findFirst({ where: { folderPath: resolvedFolderPath, workspaceId } })
    : null

  if (!collection) {
    collection = await prisma.collection.create({
      data: {
        workspaceId,
        name: (body.collectionName?.trim() || getFolderDisplayName(resolvedFolderPath)) + (mode === 'temporary' ? ' (Temporary)' : ''),
        folderPath: resolvedFolderPath,
        isTemporary: mode === 'temporary',
        runtimePreset: body.runtime_preset ?? 'general',
        pythonToolchainEnabled: !!body.python_toolchain_enabled,
        pythonVenvPath: body.python_venv_path ?? null,
        pythonInterpreterPath: body.python_interpreter_path ?? null,
      },
    })
  } else {
    collection = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        name: body.collectionName?.trim() || collection.name,
        isTemporary: mode === 'temporary',
        runtimePreset: body.runtime_preset ?? collection.runtimePreset,
        pythonToolchainEnabled: body.python_toolchain_enabled !== undefined ? !!body.python_toolchain_enabled : collection.pythonToolchainEnabled,
        pythonVenvPath: body.python_venv_path !== undefined ? (body.python_venv_path || null) : collection.pythonVenvPath,
        pythonInterpreterPath: body.python_interpreter_path !== undefined ? (body.python_interpreter_path || null) : collection.pythonInterpreterPath,
      },
    })
  }

  const existingScripts = await prisma.script.findMany({
    where: { collectionId: collection.id, sourcePath: { not: null } },
    select: { id: true, sourcePath: true },
  })
  const existingBySourcePath = new Map(
    existingScripts
      .filter((script): script is { id: string; sourcePath: string } => Boolean(script.sourcePath))
      .map((script) => [script.sourcePath, script])
  )

  const activeSourcePaths = new Set<string>()
  const linkedScripts: Array<{ id: string; name: string }> = []

  for (const filePath of files) {
    activeSourcePaths.add(filePath)

    const baseName = buildLinkedScriptName(resolvedFolderPath, filePath)
    const uniqueName = await buildUniqueScriptName(
      `${getFolderDisplayName(resolvedFolderPath)}/${baseName}`,
      filePath,
      workspaceId
    )
    const filename = path.basename(filePath)
    const language = inferScriptLanguage(filePath)
    const existing = existingBySourcePath.get(filePath)

    if (existing) {
      const updated = await prisma.script.update({
        where: { id: existing.id },
        data: {
          name: uniqueName,
          filename,
          sourcePath: filePath,
          language,
          collectionId: collection.id,
        },
      })
      linkedScripts.push({ id: updated.id, name: updated.name })
      continue
    }

    const created = await prisma.script.create({
      data: {
        workspaceId,
        name: uniqueName,
        filename,
        sourcePath: filePath,
        language,
        collectionId: collection.id,
        webhookToken: uuidv4().replace(/-/g, ''),
      },
    })
    linkedScripts.push({ id: created.id, name: created.name })
  }

  const staleScriptIds = existingScripts
    .filter((script) => script.sourcePath && !activeSourcePaths.has(script.sourcePath))
    .map((script) => script.id)

  if (staleScriptIds.length > 0) {
    await prisma.script.deleteMany({ where: { id: { in: staleScriptIds } } })
  }

  return NextResponse.json({
    collection: {
      id: collection.id,
      name: collection.name,
      folder_path: collection.folderPath,
      is_temporary: collection.isTemporary,
      runtime_preset: collection.runtimePreset,
      python_toolchain_enabled: collection.pythonToolchainEnabled,
      python_venv_path: collection.pythonVenvPath,
      python_interpreter_path: collection.pythonInterpreterPath,
    },
    scripts: linkedScripts,
    imported_count: linkedScripts.length,
  })
}
