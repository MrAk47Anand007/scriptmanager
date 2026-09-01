import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { createTeamAdminService } from '@/lib/rbac/adminService'

export async function GET(request: Request) {
  const auth = await authorizeRequest(request, 'audit', 'read')
  if (auth.response) return auth.response
  const records = await createTeamAdminService(prisma).listAudit(auth.context.workspaceId)
  if (new URL(request.url).searchParams.get('download') === 'jsonl') {
    const body = records.map((record) => JSON.stringify(record)).join('\n') + '\n'
    return new NextResponse(body, { headers: {
      'content-type': 'application/x-ndjson',
      'content-disposition': `attachment; filename="scriptmanager-audit-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      'cache-control': 'no-store',
    } })
  }
  return NextResponse.json(records, { headers: { 'cache-control': 'no-store' } })
}
