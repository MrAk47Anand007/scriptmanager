import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const newToken = uuidv4().replace(/-/g, '')

  await prisma.script.update({
    where: { id },
    data: { webhookToken: newToken }
  })

  return NextResponse.json({ webhook_token: newToken })
}
