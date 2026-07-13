import { beforeEach,describe,expect,it } from 'vitest'
import { prisma } from '@/lib/db'
import { createApprovalService } from '@/lib/approvals/service'
import { GET } from '@/app/api/approvals/route'
import { POST } from '@/app/api/approvals/[id]/decision/route'

describe('approval routes',()=>{beforeEach(async()=>{await prisma.notificationDelivery.deleteMany();await prisma.approvalDecision.deleteMany();await prisma.approvalGrant.deleteMany();await prisma.approvalRequest.deleteMany();await prisma.executionEvent.deleteMany()});it('lists and decides pending requests',async()=>{const item=await createApprovalService(prisma).create({actorType:'agent',actorId:'a',workspaceId:'w',capability:'read',operation:'inspect',resource:'src',risk:'low',correlationId:'route_corr',expiresAt:new Date(Date.now()+60000)});const list=await GET(new Request('http://localhost/api/approvals'));expect((await list.json())).toHaveLength(1);const response=await POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({decision:'allow_once'})}),{params:Promise.resolve({id:item.id})});expect(response.status).toBe(200);expect((await response.json()).status).toBe('approved')})})
