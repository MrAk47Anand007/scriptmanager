import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() { return NextResponse.json({ desktopHostRequired: true, providers: await prisma.agentProviderConfig.findMany({ orderBy: { createdAt: 'desc' } }) }) }
export async function POST(request: Request) {
  const body = await request.json()
  if (!['codex', 'claude'].includes(body.provider) || !body.name || !body.executable) return NextResponse.json({ error: 'provider, name, and executable are required' }, { status: 400 })
  if (body.credentialRef && !String(body.credentialRef).startsWith('secret://')) return NextResponse.json({ error: 'credentialRef must be an opaque vault reference' }, { status: 400 })
  return NextResponse.json(await prisma.agentProviderConfig.create({ data: { provider: body.provider, name: body.name, executable: body.executable, credentialRef: body.credentialRef } }), { status: 201 })
}
