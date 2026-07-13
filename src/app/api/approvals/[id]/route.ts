import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) { const item=await createApprovalService(prisma).get((await params).id); return item?NextResponse.json(item):NextResponse.json({error:'Not found'},{status:404}) }
