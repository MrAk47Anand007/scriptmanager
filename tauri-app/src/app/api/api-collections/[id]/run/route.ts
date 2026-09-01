import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeApiRequest } from '@/lib/executeApiRequest'
import { parseResponseMappingRows, parseVariableRows } from '@/lib/apiRequestMaterialization'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'
import { resolveApiAuthConfig } from '@/lib/secrets/apiAuth'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorization = await authorizeRequest(req, 'api', 'run')
  if (authorization.response) return authorization.response
  const actor = requireTrustedContext(await resolveTrustedRequestContext(req, prisma))
  const { environmentId } = await req.json().catch(() => ({ environmentId: null }))

  const [collection, environment] = await Promise.all([
    prisma.apiCollection.findFirst({ where: { id, workspaceId: authorization.context.workspaceId } }),
    environmentId ? prisma.apiEnvironment.findFirst({ where: { id: environmentId, workspaceId: authorization.context.workspaceId } }) : Promise.resolve(null),
  ])

  if (!collection) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const requests = await (prisma.apiRequest as any).findMany({
    where: { collectionId: id, workspaceId: authorization.context.workspaceId },
    orderBy: { createdAt: 'asc' },
  }) as Array<any>

  if (requests.length === 0) {
    return NextResponse.json({ error: 'Collection has no requests' }, { status: 400 })
  }

  const startedAt = new Date()
  const runRecord = await (prisma.apiCollectionRun as any).create({
    data: {
      collectionId: collection.id,
      collectionName: collection.name,
      environmentId: environment?.id ?? null,
      environmentName: environment?.name ?? null,
      status: 'running',
      totalRequests: requests.length,
      results: '[]',
    },
  }) as any

  const results: Array<Record<string, unknown>> = []
  let passedRequests = 0
  let failedRequests = 0

  for (const request of requests) {
    try {
      const result = await executeApiRequest({
        workspaceId: actor.workspaceId,
        requestId: request.id,
        collectionId: request.collectionId,
        environmentId: environment?.id ?? null,
        method: request.method,
        url: request.url,
        headers: parseVariableRows(request.headers),
        queryParams: parseVariableRows(request.queryParams),
        variables: parseVariableRows(request.variables),
        requestOptions: (() => { try { return JSON.parse(request.requestOptions) } catch { return {} } })(),
        preRequestScript: request.preRequestScript ?? '',
        testScript: request.testScript ?? '',
        responseMappings: parseResponseMappingRows(request.responseMappings),
        bodyType: request.bodyType,
        body: request.body,
        authType: request.authType,
        authConfig: await resolveApiAuthConfig(prisma, request.id, (() => { try { return JSON.parse(request.authConfig) } catch { return {} } })(), { workspaceId: authorization.context.workspaceId, actorId: authorization.context.userId }),
      })

      if (result.ok) {
        const failedTests = (result.testResults ?? []).filter((item) => !item.passed).length
        const passed = result.status >= 200 && result.status < 400 && failedTests === 0
        if (passed) passedRequests += 1
        else failedRequests += 1

        results.push({
          request_id: request.id,
          request_name: request.name,
          status: result.status,
          duration: result.duration,
          passed,
          failed_tests: failedTests,
          console_logs: result.consoleLogs ?? [],
          test_results: result.testResults ?? [],
          error: null,
        })
      } else {
        failedRequests += 1
        results.push({
          request_id: request.id,
          request_name: request.name,
          status: result.status,
          duration: 0,
          passed: false,
          failed_tests: 0,
          console_logs: [],
          test_results: [],
          error: result.error,
        })
      }
    } catch (error) {
      failedRequests += 1
      results.push({
        request_id: request.id,
        request_name: request.name,
        status: 500,
        duration: 0,
        passed: false,
        failed_tests: 0,
        console_logs: [],
        test_results: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const finishedAt = new Date()
  const updated = await (prisma.apiCollectionRun as any).update({
    where: { id: runRecord.id },
    data: {
      status: failedRequests > 0 ? 'completed_with_failures' : 'completed',
      passedRequests,
      failedRequests,
      results: JSON.stringify(results),
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    },
  }) as any

  return NextResponse.json({
    id: updated.id,
    collection_id: updated.collectionId,
    collection_name: updated.collectionName,
    environment_id: updated.environmentId ?? null,
    environment_name: updated.environmentName ?? null,
    status: updated.status,
    total_requests: updated.totalRequests,
    passed_requests: updated.passedRequests,
    failed_requests: updated.failedRequests,
    results: updated.results,
    started_at: updated.startedAt.toISOString(),
    finished_at: updated.finishedAt ? updated.finishedAt.toISOString() : null,
    duration_ms: updated.durationMs ?? null,
  })
}
