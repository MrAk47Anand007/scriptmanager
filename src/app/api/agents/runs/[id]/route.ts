import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const run = await prisma.agentRun.findUnique({ where: { id }, include: { profile: true, messages: { orderBy: { createdAt: 'asc' } }, artifacts: { orderBy: { createdAt: 'asc' } }, permissionGrants: true } }); return run ? NextResponse.json(run) : NextResponse.json({ error: 'Agent run not found' }, { status: 404 }) }
