export interface ApiVariableRow {
  id?: string
  key: string
  value: string
  enabled: boolean
}

export interface ApiResponseMappingRow {
  id?: string
  sourcePath: string
  variableName: string
  targetScope: 'request' | 'environment' | 'global'
  enabled: boolean
}

export type ApiVariableScopeName = 'request' | 'collection' | 'environment' | 'global'

export interface MaterializableApiRequestDraft {
  name: string
  method: string
  url: string
  headers: ApiVariableRow[]
  queryParams: ApiVariableRow[]
  bodyType: 'none' | 'json' | 'form' | 'raw' | 'graphql' | 'multipart' | 'binary'
  body: string
  authType: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2'
  authConfig: Record<string, string>
  requestOptions?: Record<string, unknown>
  preRequestScript?: string
  testScript?: string
  responseMappings?: ApiResponseMappingRow[]
  variables?: ApiVariableRow[]
  collectionId?: string | null
}

export interface ApiVariableResolution {
  name: string
  resolved: boolean
  resolvedValue: string | null
  sourceScope: ApiVariableScopeName | null
  occurrences: number
}

export interface ApiMaterializedRequest {
  name: string
  method: string
  url: string
  headers: ApiVariableRow[]
  queryParams: ApiVariableRow[]
  bodyType: MaterializableApiRequestDraft['bodyType']
  body: string
  authType: MaterializableApiRequestDraft['authType']
  authConfig: Record<string, string>
  requestOptions: Record<string, unknown>
  variables: ApiVariableResolution[]
  unresolvedVariables: string[]
}

export interface ApiVariableScopes {
  request?: ApiVariableRow[]
  collection?: ApiVariableRow[]
  environment?: ApiVariableRow[]
  global?: ApiVariableRow[]
}

interface ResolvedVariableMeta {
  value: string
  sourceScope: ApiVariableScopeName
}

const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g

export function parseVariableRows(input: string | null | undefined): ApiVariableRow[] {
  if (!input) return []

  try {
    const parsed = JSON.parse(input) as ApiVariableRow[]
    return Array.isArray(parsed)
      ? parsed.filter((row): row is ApiVariableRow => typeof row?.key === 'string' && typeof row?.value === 'string')
      : []
  } catch {
    return []
  }
}

export function parseResponseMappingRows(input: string | null | undefined): ApiResponseMappingRow[] {
  if (!input) return []

  try {
    const parsed = JSON.parse(input) as ApiResponseMappingRow[]
    return Array.isArray(parsed)
      ? parsed.filter((row): row is ApiResponseMappingRow =>
        typeof row?.sourcePath === 'string'
        && typeof row?.variableName === 'string'
        && typeof row?.targetScope === 'string'
      )
      : []
  } catch {
    return []
  }
}

export function stringifyResponseMappingRows(rows: ApiResponseMappingRow[]): string {
  return JSON.stringify(rows.filter((row) => row.sourcePath && row.variableName))
}

export function stringifyVariableRows(rows: ApiVariableRow[]): string {
  return JSON.stringify(rows.filter((row) => row.key))
}

export function findVariableNames(value: string): string[] {
  if (!value) return []

  const names = new Set<string>()
  for (const match of value.matchAll(VARIABLE_PATTERN)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

function buildResolvedVariableMap(scopes: ApiVariableScopes): Map<string, ResolvedVariableMeta> {
  const resolved = new Map<string, ResolvedVariableMeta>()
  const orderedScopes: ApiVariableScopeName[] = ['global', 'environment', 'collection', 'request']

  for (const scopeName of orderedScopes) {
    const rows = scopes[scopeName] ?? []
    for (const row of rows) {
      if (!row.enabled || !row.key) continue
      resolved.set(row.key, { value: row.value, sourceScope: scopeName })
    }
  }

  return resolved
}

function resolveTemplate(
  value: string,
  resolvedMap: Map<string, ResolvedVariableMeta>,
  usage: Map<string, ApiVariableResolution>
): string {
  if (!value) return value

  return value.replace(VARIABLE_PATTERN, (_match, rawName: string) => {
    const name = String(rawName).trim()
    const current = usage.get(name)
    const meta = resolvedMap.get(name)

    if (current) {
      current.occurrences += 1
      if (meta) {
        current.resolved = true
        current.resolvedValue = meta.value
        current.sourceScope = meta.sourceScope
      }
    } else {
      usage.set(name, {
        name,
        occurrences: 1,
        resolved: Boolean(meta),
        resolvedValue: meta?.value ?? null,
        sourceScope: meta?.sourceScope ?? null,
      })
    }

    return meta?.value ?? `{{${name}}}`
  })
}

export function materializeApiRequest(
  draft: MaterializableApiRequestDraft,
  scopes: ApiVariableScopes
): ApiMaterializedRequest {
  const resolvedMap = buildResolvedVariableMap({
    global: scopes.global ?? [],
    environment: scopes.environment ?? [],
    collection: scopes.collection ?? [],
    request: draft.variables ?? scopes.request ?? [],
  })
  const usage = new Map<string, ApiVariableResolution>()

  const materializedHeaders = draft.headers.map((row) => ({
    ...row,
    key: resolveTemplate(row.key, resolvedMap, usage),
    value: resolveTemplate(row.value, resolvedMap, usage),
  }))

  const materializedQueryParams = draft.queryParams.map((row) => ({
    ...row,
    key: resolveTemplate(row.key, resolvedMap, usage),
    value: resolveTemplate(row.value, resolvedMap, usage),
  }))

  const materializedAuthConfig = Object.fromEntries(
    Object.entries(draft.authConfig ?? {}).map(([key, value]) => [
      key,
      resolveTemplate(String(value ?? ''), resolvedMap, usage),
    ])
  )

  const variables = [...usage.values()].sort((a, b) => a.name.localeCompare(b.name))
  const unresolvedVariables = variables.filter((variable) => !variable.resolved).map((variable) => variable.name)

  return {
    name: draft.name,
    method: draft.method,
    url: resolveTemplate(draft.url, resolvedMap, usage),
    headers: materializedHeaders,
    queryParams: materializedQueryParams,
    bodyType: draft.bodyType,
    body: resolveTemplate(draft.body, resolvedMap, usage),
    authType: draft.authType,
    authConfig: materializedAuthConfig,
    requestOptions: draft.requestOptions ?? {},
    variables: [...usage.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unresolvedVariables,
  }
}
