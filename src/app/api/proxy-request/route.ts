import { NextResponse } from 'next/server'
import { executeApiRequest } from '@/lib/executeApiRequest'
import type { ApiResponseMappingRow, ApiVariableRow } from '@/lib/apiRequestMaterialization'

export async function POST(req: Request) {
  try {
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

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const result = await executeApiRequest({
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
      authConfig: (authConfig ?? {}) as Record<string, string>,
    })

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
