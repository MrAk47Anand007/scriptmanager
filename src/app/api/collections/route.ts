import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const collections = await prisma.collection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { scripts: true } } }
  })

  return NextResponse.json(collections.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    script_count: c._count.scripts,
    project_id: c.projectId ?? null,
    parent_id: c.parentId ?? null,
    folder_path: c.folderPath ?? null,
    is_temporary: c.isTemporary,
    runtime_preset: c.runtimePreset,
    python_toolchain_enabled: c.pythonToolchainEnabled,
    python_venv_path: c.pythonVenvPath ?? null,
    python_interpreter_path: c.pythonInterpreterPath ?? null,
    created_at: c.createdAt.toISOString()
  })))
}

export async function POST(req: Request) {
  const {
    name,
    description,
    project_id,
    parent_id,
    folder_path,
    is_temporary,
    runtime_preset,
    python_toolchain_enabled,
    python_venv_path,
    python_interpreter_path,
  } = await req.json()

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const collection = await prisma.collection.create({
    data: {
      name: name.trim(),
      description: description ?? '',
      projectId: project_id ?? null,
      parentId: parent_id ?? null,
      folderPath: folder_path ?? null,
      isTemporary: !!is_temporary,
      runtimePreset: runtime_preset ?? 'general',
      pythonToolchainEnabled: !!python_toolchain_enabled,
      pythonVenvPath: python_venv_path ?? null,
      pythonInterpreterPath: python_interpreter_path ?? null,
    }
  })

  return NextResponse.json({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    script_count: 0,
    project_id: collection.projectId,
    parent_id: collection.parentId,
    folder_path: collection.folderPath,
    is_temporary: collection.isTemporary,
    runtime_preset: collection.runtimePreset,
    python_toolchain_enabled: collection.pythonToolchainEnabled,
    python_venv_path: collection.pythonVenvPath,
    python_interpreter_path: collection.pythonInterpreterPath,
    created_at: collection.createdAt.toISOString()
  })
}
