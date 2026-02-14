import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeScriptAsync } from '@/lib/scriptRunner'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Parse body for optional paramValues — body may be absent for scripts with no params
  let paramValues: Record<string, string> | undefined
  try {
    const body = await req.json()
    if (body?.paramValues && typeof body.paramValues === 'object') {
      paramValues = body.paramValues
    }
  } catch {
    // No body or invalid JSON — run without params
  }

  const build = await prisma.build.create({
    data: {
      scriptId: script.id,
      status: 'pending',
      triggeredBy: 'manual'
    }
  })

  // Fire-and-forget - don't await
  executeScriptAsync(build.id, script, paramValues).catch(err => {
    console.error('[Run] Script execution error:', err)
  })

  return NextResponse.json({ build_id: build.id, status: 'started' })
}
