import { NextResponse } from 'next/server'
import { defaultSecretVaultService } from '@/lib/secrets/defaultService'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  return NextResponse.json(await defaultSecretVaultService().bindSecret(id, { resourceType: body.resourceType, resourceId: body.resourceId, field: body.field, workspaceId: body.workspaceId ?? 'default', createdBy: 'current-user' }), { status: 201 })
}
