import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { redactAgentValue } from '@/lib/agents/redaction'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const body = redactAgentValue(await request.json()); if (!body || typeof body !== 'object' || !('role' in body) || !('content' in body)) return NextResponse.json({ error: 'role and content are required' }, { status: 400 }); return NextResponse.json(await prisma.agentMessage.create({ data: { runId: id, role: String(body.role), content: String(body.content) } }), { status: 201 }) }
