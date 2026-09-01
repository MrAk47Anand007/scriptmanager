import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs'
import { getScriptFilePath } from '@/lib/scriptRunner'
import { cache } from '@/lib/cache'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'update')
  if (authorization.response) return authorization.response
  const { id } = await params
  const {
    name,
    project_id,
    parent_id,
    folder_path,
    is_temporary,
    runtime_preset,
    python_toolchain_enabled,
    python_venv_path,
    python_interpreter_path,
    storage_provider_id,
    remote_prefix,
  } = await req.json()

  const collection = await prisma.collection.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  if (storage_provider_id) {
    const provider = await prisma.storageProvider.findFirst({ where: { id: storage_provider_id, workspaceId: authorization.context.workspaceId } })
    if (!provider) {
      return NextResponse.json({ error: 'Storage provider not found' }, { status: 400 })
    }
  }
  if (project_id) {
    const project = await prisma.project.findFirst({ where: { id: project_id, workspaceId: authorization.context.workspaceId } })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (parent_id) {
    const parent = await prisma.collection.findFirst({ where: { id: parent_id, workspaceId: authorization.context.workspaceId } })
    if (!parent) return NextResponse.json({ error: 'Parent collection not found' }, { status: 404 })
  }

  const updated = await prisma.collection.update({
    where: { id },
    data: {
      name: name?.trim() ? name.trim() : collection.name,
      projectId: project_id ?? null,
      parentId: parent_id !== undefined ? (parent_id || null) : collection.parentId,
      folderPath: folder_path !== undefined ? (folder_path || null) : collection.folderPath,
      isTemporary: is_temporary !== undefined ? !!is_temporary : collection.isTemporary,
      runtimePreset: runtime_preset ?? collection.runtimePreset,
      pythonToolchainEnabled: python_toolchain_enabled !== undefined ? !!python_toolchain_enabled : collection.pythonToolchainEnabled,
      pythonVenvPath: python_venv_path !== undefined ? (python_venv_path || null) : collection.pythonVenvPath,
      pythonInterpreterPath: python_interpreter_path !== undefined ? (python_interpreter_path || null) : collection.pythonInterpreterPath,
      storageProviderId: storage_provider_id !== undefined ? (storage_provider_id || null) : collection.storageProviderId,
      remotePrefix: remote_prefix !== undefined ? (remote_prefix || null) : collection.remotePrefix,
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    project_id: updated.projectId,
    parent_id: updated.parentId,
    folder_path: updated.folderPath,
    is_temporary: updated.isTemporary,
    runtime_preset: updated.runtimePreset,
    python_toolchain_enabled: updated.pythonToolchainEnabled,
    python_venv_path: updated.pythonVenvPath,
    python_interpreter_path: updated.pythonInterpreterPath,
    storage_provider_id: updated.storageProviderId,
    remote_prefix: updated.remotePrefix,
    created_at: updated.createdAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'delete')
  if (authorization.response) return authorization.response
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const hardDelete = searchParams.get('hardDelete') === 'true'

  const collection = await prisma.collection.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } })
  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  if (hardDelete) {
    const scripts = await prisma.script.findMany({
      where: { collectionId: id },
      select: { id: true, filename: true, sourcePath: true },
    })

    for (const script of scripts) {
      if (!script.sourcePath) {
        const filePath = await getScriptFilePath(script.filename)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

    await prisma.script.deleteMany({ where: { collectionId: id } })
    await prisma.collection.delete({ where: { id } })
    await cache.del(`all_scripts:${authorization.context.workspaceId}`)
    return NextResponse.json({ message: 'Collection removed', deleted_script_ids: scripts.map((script) => script.id) })
  }

  // Move all scripts to unsorted (null collection)
  await prisma.script.updateMany({
    where: { collectionId: id },
    data: { collectionId: null }
  })

  await prisma.collection.delete({ where: { id } })
  await cache.del(`all_scripts:${authorization.context.workspaceId}`)

  return NextResponse.json({ message: 'Collection deleted' })
}
