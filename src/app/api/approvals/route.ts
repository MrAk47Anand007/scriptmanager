import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status') ?? 'pending'
  return NextResponse.json(await createApprovalService(prisma).list(status))
}
