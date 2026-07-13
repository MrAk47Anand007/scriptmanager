import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { if (request.headers.get('x-scriptmanager-desktop') !== '1') return NextResponse.json({ error: 'Resume requires ScriptManager Desktop', desktopHostRequired: true }, { status: 409 }); const { id } = await context.params; return NextResponse.json(await prisma.agentRun.update({ where: { id }, data: { status: 'running', finishedAt: null } })) }
