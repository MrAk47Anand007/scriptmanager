import { NextResponse } from 'next/server'
import { executeApiRequest } from '@/lib/executeApiRequest'
import type { ApiResponseMappingRow, ApiVariableRow } from '@/lib/apiRequestMaterialization'
import { executionTelemetry } from '@/lib/execution'
import { prisma } from '@/lib/db'
import { resolveApiAuthConfig } from '@/lib/secrets/apiAuth'
import { resolveTrustedRequestContext } from '@/lib/rbac/requestContext'
import { requireTrustedContext } from '@/lib/runtime/trustedContext'

export async function POST(req: Request) {
  const correlationId = executionTelemetry.correlationId(req)
  let targetId = 'draft'
  try {
    const actor = requireTrustedContext(await resolveTrustedRequestContext(req, prisma))
    const {
      requestId,
      collectionId,
      environmentId,
      method,
      url,
      headers,
      queryParams,
      variables,
      requestOptions,
      preRequestScript,
      testScript,
      responseMappings,
      bodyType,
      body,
      authType,
      authConfig
    } = await req.json()
    targetId = requestId ?? 'draft'

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    await executionTelemetry.emit({
      type: 'execution.started', executionKind: 'api', correlationId,
      actor: { type: 'user', id: 'session-user' },
      target: { type: 'api_request', id: targetId },
      data: { method: method ?? 'GET', trigger: 'manual' },
    })

    const result = await executeApiRequest({
      workspaceId: actor.workspaceId,
      requestId: requestId ?? null,
      collectionId: collectionId ?? null,
      environmentId: environmentId ?? null,
      method: method ?? 'GET',
      url,
      headers: Array.isArray(headers) ? headers as ApiVariableRow[] : [],
      queryParams: Array.isArray(queryParams) ? queryParams as ApiVariableRow[] : [],
      variables: Array.isArray(variables) ? variables as ApiVariableRow[] : [],
      requestOptions: (requestOptions ?? {}) as Record<string, unknown>,
      preRequestScript: preRequestScript ?? '',
      testScript: testScript ?? '',
      responseMappings: Array.isArray(responseMappings) ? responseMappings as ApiResponseMappingRow[] : [],
      bodyType: bodyType ?? 'none',
      body: body ?? '',
      authType: authType ?? 'none',
      authConfig: requestId ? await resolveApiAuthConfig(prisma, requestId, authConfig ?? {}, { workspaceId: actor.workspaceId, actorId: actor.actorId }) : (authConfig ?? {}) as Record<string, string>,
    })

    if (!result.ok) {
      await executionTelemetry.emit({
        type: 'execution.failed', executionKind: 'api', correlationId,
        actor: { type: 'user', id: 'session-user' }, target: { type: 'api_request', id: targetId },
        data: { status: result.status },
      })
      return NextResponse.json(result, { status: result.status })
    }

    await executionTelemetry.emit({
      type: 'execution.succeeded', executionKind: 'api', correlationId,
      actor: { type: 'user', id: 'session-user' }, target: { type: 'api_request', id: targetId },
      data: { status: result.status },
    })

    return NextResponse.json(result, { headers: { 'x-correlation-id': correlationId } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await executionTelemetry.emit({
      type: 'execution.failed', executionKind: 'api', correlationId,
      actor: { type: 'user', id: 'session-user' }, target: { type: 'api_request', id: targetId },
      data: { error: message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
