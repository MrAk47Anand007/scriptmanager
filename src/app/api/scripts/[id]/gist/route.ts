import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteGistFromGitHub } from '@/lib/gistService'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Try to delete from GitHub (non-fatal if fails)
  if (script.gistId) {
    try {
      await deleteGistFromGitHub(script.gistId)
    } catch (err) {
      console.error('[Gist] Failed to delete from GitHub:', err)
    }
  }

  await prisma.script.update({
    where: { id },
    data: {
      gistId: null,
      gistUrl: null,
      gistFilename: null,
      syncToGist: false
    }
  })

  return NextResponse.json({ message: 'Gist unlinked' })
}
