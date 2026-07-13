import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import type { ApprovalDecisionKind } from '@/lib/approvals/types'
const decisions=new Set(['allow_once','allow_run','allow_workspace','reject'])
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) { try { const body=await request.json() as {decision:ApprovalDecisionKind;decidedBy?:string;note?:string}; if(!decisions.has(body.decision)) return NextResponse.json({error:'Invalid decision'},{status:400}); return NextResponse.json(await createApprovalService(prisma).decide((await params).id,body.decision,body.decidedBy??'current-user',body.note)) } catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:409})} }
