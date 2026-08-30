import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

// GET /api/builds/output/[scriptId]/[buildId] — get full log output of a build
export async function GET(
  req: Request,
  { params }: { params: Promise<{ scriptId: string; buildId: string }> }
) {
  const authorization = await authorizeRequest(req, 'script', 'read')
  if (authorization.response) return authorization.response
  const { scriptId, buildId } = await params

  const build = await prisma.build.findFirst({ where: { id: buildId, scriptId, script: { workspaceId: authorization.context.workspaceId } } })
  if (!build) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  }

  let output = ''
  if (build.logFile && fs.existsSync(build.logFile)) {
    try {
      output = fs.readFileSync(build.logFile, 'utf8')
    } catch {
      output = '(could not read log file)'
    }
  }

  return NextResponse.json({ output })
}
