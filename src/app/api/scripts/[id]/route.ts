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
    parameters: (() => { try { return JSON.parse(script.parameters ?? '[]') } catch { return [] } })(),
    created_at: script.createdAt.toISOString(),
    updated_at: script.updatedAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const deleteGist = searchParams.get('deleteGist') === 'true'

  try {
    const script = await prisma.script.findUnique({ where: { id } })
    if (!script) {
      return NextResponse.json({ error: 'Script not found' }, { status: 404 })
    }

    // Optional: Delete from GitHub Gist
    if (deleteGist && script.gistId) {
      // Need to import dynamically or ensure circular deps are handled if any
      // But here we can use the service directly
      const { deleteGistFromGitHub } = await import('@/lib/gistService')
      try {
        await deleteGistFromGitHub(script.gistId)
      } catch (err) {
        console.error('[Delete] Failed to delete Gist:', err)
        // We continue deleting the local script even if Gist deletion fails
      }
    }

    // Delete file from filesystem
    const filePath = await getScriptFilePath(script.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Delete from database
    await prisma.script.delete({ where: { id } })

    // Invalidate script list cache
    const { cache } = await import('@/lib/cache')
    await cache.del('all_scripts')

    return NextResponse.json({ message: 'Script deleted successfully', id })
  } catch (error: any) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
