import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const template = await prisma.scriptTemplate.findUnique({ where: { id } })
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  if (template.isBuiltIn) {
    return NextResponse.json({ error: 'Built-in templates cannot be deleted' }, { status: 403 })
  }

  await prisma.scriptTemplate.delete({ where: { id } })
  return NextResponse.json({ message: 'Template deleted' })
}
