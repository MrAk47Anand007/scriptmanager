import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getScriptResolvedFilePath, getScriptsRootDir } from '@/lib/scriptRunner'
import { moveManagedScriptFile } from '@/lib/managedScriptFiles'
import { resolveScriptSourcePathAfterMove } from '@/lib/scriptPathResolver'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import path from 'path'

function isPathInside(basePath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(basePath), path.resolve(targetPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { collection_id } = await req.json()

  const script = await prisma.script.findFirst({ where: { id, workspaceId: authorization.context.workspaceId }, include: { collection: true } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const collection = collection_id
    ? await prisma.collection.findFirst({ where: { id: collection_id, workspaceId: authorization.context.workspaceId } })
    : null
  if (collection_id) {
    if (!collection) return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  if (script.sourcePath) {
    if (collection_id !== script.collectionId) {
      return NextResponse.json({ error: 'Canonical scripts must be moved on disk, then the folder rescanned' }, { status: 409 })
    }
    return NextResponse.json({ collection_id: script.collectionId })
  }

  const scriptsRoot = await getScriptsRootDir()
  const sourcePath = await getScriptResolvedFilePath(script)
  const destinationDirectory = collection?.folderPath ? path.resolve(collection.folderPath) : scriptsRoot
  const destinationPath = path.resolve(destinationDirectory, path.basename(script.filename))
  const destinationIsManaged = !collection?.folderPath || isPathInside(scriptsRoot, destinationDirectory)
  const nextSourcePath = resolveScriptSourcePathAfterMove(destinationPath, destinationIsManaged)
  const moved = sourcePath !== destinationPath

  if (moved) moveManagedScriptFile(sourcePath, destinationDirectory, script.filename)

  let updated
  try {
    updated = await prisma.script.update({
      where: { id },
      data: { collectionId: collection_id ?? null, sourcePath: nextSourcePath, sourceAvailable: true },
    })
  } catch (error) {
    if (moved) {
      try {
        moveManagedScriptFile(destinationPath, path.dirname(sourcePath), path.basename(script.filename))
      } catch (rollbackError) {
        console.error('[ScriptMove] Failed to roll back managed script move:', rollbackError)
      }
    }
    throw error
  }

  return NextResponse.json({ collection_id: updated.collectionId })
}
