import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const history = await prisma.apiHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  })

  return NextResponse.json(history.map(h => ({
    id: h.id,
    request_id: h.requestId ?? null,
    method: h.method,
    url: h.url,
    request_headers: h.requestHeaders,
    request_body: h.requestBody,
    status: h.status,
    status_text: h.statusText,
    duration: h.duration,
    size: h.size,
    response_headers: h.responseHeaders,
    response_body: h.responseBody,
    created_at: h.createdAt.toISOString()
  })))
}

export async function DELETE() {
  await prisma.apiHistory.deleteMany({})
  return NextResponse.json({ success: true })
}
