import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = Promise<{ id: string }>

// GET /api/scripts/[id]/env — list env vars (values masked for secrets)
export async function GET(
  _req: Request,
  { params }: { params: Params }
) {
  const { id: scriptId } = await params

  const script = await prisma.script.findUnique({ where: { id: scriptId } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const envVars = await prisma.scriptEnvVar.findMany({
    where: { scriptId },
    orderBy: { key: 'asc' },
  })

  return NextResponse.json(
    envVars.map(v => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? '' : v.value,
      is_secret: v.isSecret,
    }))
  )
}

// POST /api/scripts/[id]/env — upsert (create or update) an env var
export async function POST(
  req: Request,
  { params }: { params: Params }
) {
  const { id: scriptId } = await params
  const body = await req.json()
  const key = (body.key ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  const value = body.value ?? ''
  const isSecret = !!body.is_secret

  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  const script = await prisma.script.findUnique({ where: { id: scriptId } })
  if (!script) return NextResponse.json({ error: 'Script not found' }, { status: 404 })

  const envVar = await prisma.scriptEnvVar.upsert({
    where: { scriptId_key: { scriptId, key } },
    update: { value, isSecret },
    create: { scriptId, key, value, isSecret },
  })

  return NextResponse.json({
    id: envVar.id,
    key: envVar.key,
    value: envVar.isSecret ? '' : envVar.value,
    is_secret: envVar.isSecret,
  })
}

// DELETE /api/scripts/[id]/env?key=... — remove an env var
export async function DELETE(
  req: Request,
  { params }: { params: Params }
) {
  const { id: scriptId } = await params
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key query param required' }, { status: 400 })

  await prisma.scriptEnvVar.deleteMany({ where: { scriptId, key } })
  return NextResponse.json({ message: 'Env var deleted' })
}
