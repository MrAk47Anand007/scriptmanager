import type { ApiRequest, ApiRequestDraft, ApiCollection, ApiEnvironment, KeyValueRow } from '@/features/api/apiSlice'
import { parseVariableRows } from '@/lib/apiRequestMaterialization'

interface ImportedCollection {
  name: string
  requests: Array<Partial<ApiRequestDraft>>
}

interface ImportedEnvironment {
  name: string
  variables: KeyValueRow[]
}

export interface ImportedPostmanWorkspace {
  collections: ImportedCollection[]
  environments: ImportedEnvironment[]
}

interface ExportableRequest {
  name: string
  method: string
  url: string
  headers: string
  query_params: string
  body_type: string
  body: string
  auth_type: string
  auth_config: string
}

function blankRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true }
}

function ensureRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.length > 0 ? rows : [blankRow()]
}

function normalizeHeaders(headers: unknown): KeyValueRow[] {
  if (!Array.isArray(headers)) return [blankRow()]
  const rows = headers.flatMap((header) => {
    if (typeof header === 'string') {
      const separatorIndex = header.indexOf(':')
      if (separatorIndex === -1) return []
      return [{
        id: crypto.randomUUID(),
        key: header.slice(0, separatorIndex).trim(),
        value: header.slice(separatorIndex + 1).trim(),
        enabled: true,
      }]
    }
    if (typeof header === 'object' && header !== null && 'key' in header) {
      const entry = header as { key?: string; value?: string; disabled?: boolean }
      return [{
        id: crypto.randomUUID(),
        key: entry.key ?? '',
        value: entry.value ?? '',
        enabled: !entry.disabled,
      }]
    }
    return []
  })
  return ensureRows(rows)
}

function normalizeUrl(url: unknown): { url: string; queryParams: KeyValueRow[] } {
  if (typeof url === 'string') return { url, queryParams: [blankRow()] }
  if (!url || typeof url !== 'object') return { url: '', queryParams: [blankRow()] }

  const value = url as {
    raw?: string
    protocol?: string
    host?: string[]
    path?: string[]
    query?: Array<{ key?: string; value?: string; disabled?: boolean }>
  }
  const queryParams = ensureRows((value.query ?? []).map((item) => ({
    id: crypto.randomUUID(),
    key: item.key ?? '',
    value: item.value ?? '',
    enabled: !item.disabled,
  })))
  const builtUrl = value.raw
    ?? `${value.protocol ?? 'https'}://${(value.host ?? []).join('.')}/${(value.path ?? []).join('/')}`.replace(/\/$/, '')
  return { url: builtUrl, queryParams }
}

function convertPostmanBody(body: unknown): Pick<ApiRequestDraft, 'bodyType' | 'body'> {
  if (!body || typeof body !== 'object') return { bodyType: 'none', body: '' }
  const value = body as Record<string, unknown>
  if (value.mode === 'raw') {
    const rawBody = typeof value.raw === 'string' ? value.raw : ''
    const language = typeof value.options === 'object' && value.options && 'raw' in value.options
      ? (value.options as any).raw?.language
      : undefined
    if (language === 'json') return { bodyType: 'json', body: rawBody }
    return { bodyType: 'raw', body: rawBody }
  }
  if (value.mode === 'urlencoded' && Array.isArray(value.urlencoded)) {
    return {
      bodyType: 'form',
      body: JSON.stringify((value.urlencoded as Array<any>).map((item) => ({
        id: crypto.randomUUID(),
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: !item.disabled,
      }))),
    }
  }
  if (value.mode === 'formdata' && Array.isArray(value.formdata)) {
    return {
      bodyType: 'multipart',
      body: JSON.stringify((value.formdata as Array<any>).map((item) => ({
        id: crypto.randomUUID(),
        key: item.key ?? '',
        value: item.value ?? '',
        enabled: !item.disabled,
      }))),
    }
  }
  if (value.mode === 'graphql' && typeof value.graphql === 'object' && value.graphql) {
    const graphql = value.graphql as Record<string, unknown>
    return {
      bodyType: 'graphql',
      body: JSON.stringify({
        query: graphql.query ?? '',
        variables: typeof graphql.variables === 'string' ? graphql.variables : JSON.stringify(graphql.variables ?? {}),
        operationName: graphql.operationName ?? '',
      }),
    }
  }
  return { bodyType: 'none', body: '' }
}

function flattenItems(items: any[], acc: any[] = []): any[] {
  for (const item of items) {
    if (Array.isArray(item.item)) flattenItems(item.item, acc)
    else acc.push(item)
  }
  return acc
}

export function importPostmanData(raw: string): ImportedPostmanWorkspace {
  const parsed = JSON.parse(raw)
  const collections: ImportedCollection[] = []
  const environments: ImportedEnvironment[] = []

  if (parsed?.info && Array.isArray(parsed?.item)) {
    const flatItems = flattenItems(parsed.item)
    collections.push({
      name: parsed.info.name ?? 'Imported Collection',
      requests: flatItems.map((item: any) => {
        const request = item.request ?? {}
        const normalizedUrl = normalizeUrl(request.url)
        const convertedBody = convertPostmanBody(request.body)
        return {
          name: item.name ?? 'Imported Request',
          method: request.method ?? 'GET',
          url: normalizedUrl.url,
          queryParams: normalizedUrl.queryParams,
          headers: normalizeHeaders(request.header),
          variables: [blankRow()],
          requestOptions: { useCookieJar: false },
          preRequestScript: '',
          testScript: '',
          responseMappings: [],
          authType: 'none',
          authConfig: {},
          ...convertedBody,
        }
      }),
    })
  } else if (Array.isArray(parsed?.values)) {
    environments.push({
      name: parsed.name ?? 'Imported Environment',
      variables: ensureRows(parsed.values.map((value: any) => ({
        id: crypto.randomUUID(),
        key: value.key ?? '',
        value: value.value ?? '',
        enabled: value.enabled !== false,
      }))),
    })
  } else {
    throw new Error('Unsupported Postman export file')
  }

  return { collections, environments }
}

export function buildNativeApiExport({
  collections,
  requests,
  environments,
  globalVariables,
}: {
  collections: ApiCollection[]
  requests: any[]
  environments: ApiEnvironment[]
  globalVariables: KeyValueRow[]
}) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    collections,
    requests,
    environments,
    globalVariables,
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toPostmanHeaders(headers: string) {
  return parseVariableRows(headers)
    .filter((row) => row.enabled && row.key)
    .map((row) => ({
      key: row.key,
      value: row.value,
      disabled: !row.enabled,
    }))
}

function buildRawUrl(url: string, query: Array<{ key?: string; value?: string; enabled?: boolean }>): string {
  if (!query.some((row) => row.enabled && row.key)) return url

  const search = query
    .filter((row) => row.enabled && row.key)
    .map((row) => `${encodeURIComponent(row.key ?? '')}=${encodeURIComponent(row.value ?? '')}`)
    .join('&')

  if (!search) return url
  return url.includes('?') ? `${url}&${search}` : `${url}?${search}`
}

function toPostmanUrl(url: string, queryParams: string) {
  const query = parseVariableRows(queryParams)
    .filter((row) => row.enabled && row.key)
    .map((row) => ({
      key: row.key,
      value: row.value,
      disabled: !row.enabled,
    }))

  const raw = buildRawUrl(url, parseVariableRows(queryParams))

  try {
    const parsed = new URL(raw)
    const protocol = parsed.protocol.replace(/:$/, '')
    const host = parsed.hostname.split('.').filter(Boolean)
    const path = parsed.pathname.split('/').filter(Boolean)
    return {
      raw,
      protocol,
      host,
      path,
      query,
    }
  } catch {
    return { raw, query }
  }
}

function toPostmanBody(request: ExportableRequest) {
  switch (request.body_type) {
    case 'json':
      return {
        mode: 'raw',
        raw: request.body ?? '',
        options: { raw: { language: 'json' } },
      }
    case 'raw':
      return {
        mode: 'raw',
        raw: request.body ?? '',
      }
    case 'form': {
      const rows = parseVariableRows(request.body)
        .filter((row) => row.enabled && row.key)
        .map((row) => ({
          key: row.key,
          value: row.value,
          disabled: !row.enabled,
        }))
      return { mode: 'urlencoded', urlencoded: rows }
    }
    case 'multipart': {
      const rows = parseVariableRows(request.body)
        .filter((row) => row.enabled && row.key)
        .map((row) => ({
          key: row.key,
          value: row.value,
          type: 'text',
          disabled: !row.enabled,
        }))
      return { mode: 'formdata', formdata: rows }
    }
    case 'graphql': {
      const parsed = parseJson<Record<string, string>>(request.body, {})
      return {
        mode: 'graphql',
        graphql: {
          query: parsed.query ?? '',
          variables: parsed.variables ?? '',
          operationName: parsed.operationName ?? '',
        },
      }
    }
    default:
      return undefined
  }
}

function toPostmanAuth(authType: string, authConfig: string) {
  const config = parseJson<Record<string, string>>(authConfig, {})

  switch (authType) {
    case 'bearer':
      return { type: 'bearer', bearer: [{ key: 'token', value: config.token ?? '', type: 'string' }] }
    case 'basic':
      return {
        type: 'basic',
        basic: [
          { key: 'username', value: config.username ?? '', type: 'string' },
          { key: 'password', value: config.password ?? '', type: 'string' },
        ],
      }
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          { key: 'key', value: config.key ?? '', type: 'string' },
          { key: 'value', value: config.value ?? '', type: 'string' },
          { key: 'in', value: config.in ?? 'header', type: 'string' },
        ],
      }
    case 'oauth2':
      return {
        type: 'oauth2',
        oauth2: [{ key: 'accessToken', value: config.accessToken ?? '', type: 'string' }],
      }
    default:
      return { type: 'noauth' }
  }
}

function toPostmanItem(request: ExportableRequest) {
  return {
    name: request.name,
    request: {
      method: request.method,
      header: toPostmanHeaders(request.headers),
      url: toPostmanUrl(request.url, request.query_params),
      body: toPostmanBody(request),
      auth: toPostmanAuth(request.auth_type, request.auth_config),
    },
    response: [],
  }
}

export function buildPostmanCollectionExport({
  collections,
  requests,
}: {
  collections: ApiCollection[]
  requests: ApiRequest[]
}) {
  const collectionItems = collections.map((collection) => ({
    name: collection.name,
    item: requests
      .filter((request) => request.collection_id === collection.id)
      .map((request) => toPostmanItem(request)),
  }))

  const uncollected = requests
    .filter((request) => !request.collection_id)
    .map((request) => toPostmanItem(request))

  return {
    info: {
      name: 'ScriptManager Export',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      _postman_id: crypto.randomUUID(),
    },
    item: [...collectionItems, ...uncollected],
  }
}

export function buildPostmanEnvironmentExport({
  environment,
}: {
  environment: ApiEnvironment | null
}) {
  const rows = environment ? parseVariableRows(environment.variables) : []

  return {
    id: crypto.randomUUID(),
    name: environment?.name ?? 'ScriptManager Environment',
    values: rows
      .filter((row) => row.key)
      .map((row) => ({
        key: row.key,
        value: row.value,
        enabled: row.enabled,
        type: 'default',
      })),
    _postman_variable_scope: 'environment',
    _postman_exported_at: new Date().toISOString(),
    _postman_exported_using: 'ScriptManager',
  }
}
