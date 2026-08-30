import { prisma } from '@/lib/db'
import {
  materializeApiRequest,
  parseResponseMappingRows,
  parseVariableRows,
  stringifyVariableRows,
  type ApiResponseMappingRow,
  type ApiVariableRow,
  type MaterializableApiRequestDraft,
} from '@/lib/apiRequestMaterialization'
import { executeApiScripts } from '@/lib/apiScripting'
import { apiGlobalsSettingKey, LEGACY_API_GLOBALS_KEY } from '@/lib/apiWorkspace'
import { fetchWithSafeRedirects, ProxyTargetError } from '@/lib/proxyTarget'

const MAX_BODY_SIZE = 1024 * 1024
const COOKIE_JAR_KEY_PREFIX = 'api_cookie_jar:'

async function readApiGlobalsSetting(workspaceId: string) {
  const scoped = await prisma.setting.findUnique({ where: { key: apiGlobalsSettingKey(workspaceId) } })
  if (scoped || workspaceId !== 'default') return scoped
  return prisma.setting.findUnique({ where: { key: LEGACY_API_GLOBALS_KEY } })
}

interface AuthConfig {
  token?: string
  username?: string
  password?: string
  keyName?: string
  keyValue?: string
  keyLocation?: 'header' | 'query'
  accessToken?: string
  tokenType?: string
}

interface BinaryBodyPayload {
  fileName?: string
  mimeType?: string
  data?: string
}

interface CookieJarStore {
  [hostname: string]: Record<string, string>
}

export interface ExecuteApiRequestInput {
  workspaceId: string
  requestId?: string | null
  collectionId?: string | null
  environmentId?: string | null
  method: string
  url: string
  headers: ApiVariableRow[]
  queryParams: ApiVariableRow[]
  variables: ApiVariableRow[]
  requestOptions?: Record<string, unknown>
  preRequestScript?: string
  testScript?: string
  responseMappings?: ApiResponseMappingRow[]
  bodyType: MaterializableApiRequestDraft['bodyType']
  body: string
  authType: MaterializableApiRequestDraft['authType']
  authConfig: Record<string, string>
  signal?: AbortSignal
}

function cookieJarKey(workspaceId: string) {
  return `${COOKIE_JAR_KEY_PREFIX}${workspaceId}`
}

export async function readCookieJar(workspaceId: string): Promise<CookieJarStore> {
  const setting = await prisma.setting.findUnique({ where: { key: cookieJarKey(workspaceId) } })
  if (!setting?.value) return {}
  try {
    return JSON.parse(setting.value) as CookieJarStore
  } catch {
    return {}
  }
}

export async function writeCookieJar(workspaceId: string, jar: CookieJarStore) {
  await prisma.setting.upsert({
    where: { key: cookieJarKey(workspaceId) },
    update: { value: JSON.stringify(jar) },
    create: { key: cookieJarKey(workspaceId), value: JSON.stringify(jar) },
  })
}

function extractCookiePair(rawCookie: string): { name: string; value: string } | null {
  const [pair] = rawCookie.split(';')
  const separatorIndex = pair.indexOf('=')
  if (separatorIndex === -1) return null
  const name = pair.slice(0, separatorIndex).trim()
  const value = pair.slice(separatorIndex + 1).trim()
  if (!name) return null
  return { name, value }
}

function buildCookieHeader(jar: CookieJarStore, hostname: string): string | null {
  const cookies = jar[hostname]
  if (!cookies) return null
  const pairs = Object.entries(cookies).map(([name, value]) => `${name}=${value}`)
  return pairs.length > 0 ? pairs.join('; ') : null
}

function getValueAtPath(input: unknown, path: string): unknown {
  if (!path.trim()) return undefined
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean)
  let current: unknown = input
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (Number.isNaN(index)) return undefined
      current = current[index]
      continue
    }
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

async function applyResponseMappings({
  requestId,
  workspaceId,
  environmentId,
  responseBody,
  responseMappings,
}: {
  requestId?: string | null
  workspaceId: string
  environmentId?: string | null
  responseBody: string
  responseMappings: ApiResponseMappingRow[]
}) {
  const enabledMappings = responseMappings.filter((mapping) => mapping.enabled && mapping.sourcePath && mapping.variableName)
  if (enabledMappings.length === 0) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(responseBody)
  } catch {
    return enabledMappings.map((mapping) => ({
      variableName: mapping.variableName,
      sourcePath: mapping.sourcePath,
      targetScope: mapping.targetScope,
      applied: false,
      reason: 'Response body is not valid JSON',
    }))
  }

  const [requestRecord, environmentRecord, globalRecord] = await Promise.all([
    requestId ? (prisma.apiRequest as any).findFirst({ where: { id: requestId, workspaceId } }) as Promise<any> : Promise.resolve(null),
    environmentId ? prisma.apiEnvironment.findFirst({ where: { id: environmentId, workspaceId } }) : Promise.resolve(null),
    readApiGlobalsSetting(workspaceId),
  ])
  const requestRows = requestRecord ? parseVariableRows(requestRecord.variables) : []
  const environmentRows = environmentRecord ? parseVariableRows(environmentRecord.variables) : []
  const globalRows = parseVariableRows(globalRecord?.value)
  const updates: Array<Record<string, unknown>> = []

  for (const mapping of enabledMappings) {
    const value = getValueAtPath(parsed, mapping.sourcePath)
    if (value === undefined) {
      updates.push({
        variableName: mapping.variableName,
        sourcePath: mapping.sourcePath,
        targetScope: mapping.targetScope,
        applied: false,
        reason: 'Path not found',
      })
      continue
    }

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    const upsertRow = (rows: ApiVariableRow[]) => {
      const existing = rows.find((row) => row.key === mapping.variableName)
      if (existing) {
        existing.value = stringValue
        existing.enabled = true
      } else {
        rows.push({ key: mapping.variableName, value: stringValue, enabled: true })
      }
    }

    if (mapping.targetScope === 'request' && requestRecord) {
      upsertRow(requestRows)
    } else if (mapping.targetScope === 'environment' && environmentRecord) {
      upsertRow(environmentRows)
    } else if (mapping.targetScope === 'global') {
      upsertRow(globalRows)
    } else {
      updates.push({
        variableName: mapping.variableName,
        sourcePath: mapping.sourcePath,
        targetScope: mapping.targetScope,
        applied: false,
        reason: 'Target scope unavailable',
      })
      continue
    }

    updates.push({
      variableName: mapping.variableName,
      sourcePath: mapping.sourcePath,
      targetScope: mapping.targetScope,
      applied: true,
      value: stringValue,
    })
  }

  await Promise.all([
    requestRecord
      ? (prisma.apiRequest as any).update({ where: { id: requestRecord.id }, data: { variables: stringifyVariableRows(requestRows) } })
      : Promise.resolve(),
    environmentRecord
      ? prisma.apiEnvironment.update({ where: { id: environmentRecord.id }, data: { variables: stringifyVariableRows(environmentRows) } })
      : Promise.resolve(),
    prisma.setting.upsert({
      where: { key: apiGlobalsSettingKey(workspaceId) },
      update: { value: stringifyVariableRows(globalRows) },
      create: { key: apiGlobalsSettingKey(workspaceId), value: stringifyVariableRows(globalRows) },
    }),
  ])

  return updates
}

export async function executeApiRequest(input: ExecuteApiRequestInput) {
  const [environment, collection, globalSetting] = await Promise.all([
    input.environmentId ? prisma.apiEnvironment.findFirst({ where: { id: input.environmentId, workspaceId: input.workspaceId } }) : Promise.resolve(null),
    input.collectionId ? prisma.apiCollection.findFirst({ where: { id: input.collectionId, workspaceId: input.workspaceId } }) : Promise.resolve(null),
    readApiGlobalsSetting(input.workspaceId),
  ])

  const materialized = materializeApiRequest(
    {
      name: input.requestId ?? 'Ad hoc request',
      method: input.method ?? 'GET',
      url: input.url,
      headers: input.headers,
      queryParams: input.queryParams,
      variables: input.variables,
      bodyType: input.bodyType,
      body: input.body ?? '',
      authType: input.authType ?? 'none',
      authConfig: input.authConfig ?? {},
      requestOptions: input.requestOptions ?? {},
      collectionId: input.collectionId ?? null,
      responseMappings: input.responseMappings ?? [],
    },
    {
      global: parseVariableRows(globalSetting?.value),
      environment: parseVariableRows(environment?.variables),
      collection: parseVariableRows(collection?.variables),
    }
  )

  if (materialized.unresolvedVariables.length > 0) {
    return {
      ok: false as const,
      status: 400,
      error: 'Unresolved variables',
      unresolved_variables: materialized.unresolvedVariables,
      variables: materialized.variables,
    }
  }

  const preRequestExecution = executeApiScripts({
    request: materialized,
    preRequestScript: input.preRequestScript,
  })
  const runtimeRequest = preRequestExecution.request

  let finalUrl = runtimeRequest.url
  try {
    const parsedUrl = new URL(finalUrl)
    const enabledParams = runtimeRequest.queryParams.filter((param) => param.enabled && param.key)
    if (runtimeRequest.authType === 'apikey') {
      const config = runtimeRequest.authConfig as AuthConfig
      if (config.keyLocation === 'query' && config.keyName && config.keyValue) {
        parsedUrl.searchParams.set(config.keyName, config.keyValue)
      }
    }
    enabledParams.forEach((param) => parsedUrl.searchParams.append(param.key, param.value))
    finalUrl = parsedUrl.toString()
  } catch {
    // keep original URL
  }

  const finalHeaders: Record<string, string> = {}
  const useCookieJar = Boolean(runtimeRequest.requestOptions?.useCookieJar)
  const cookieJar = useCookieJar ? await readCookieJar(input.workspaceId) : {}

  runtimeRequest.headers.filter((header) => header.enabled && header.key).forEach((header) => {
    finalHeaders[header.key] = header.value
  })

  const authConfig = runtimeRequest.authConfig as AuthConfig
  if (runtimeRequest.authType === 'bearer' && authConfig.token) {
    finalHeaders.Authorization = `Bearer ${authConfig.token}`
  } else if (runtimeRequest.authType === 'basic' && (authConfig.username !== undefined || authConfig.password !== undefined)) {
    finalHeaders.Authorization = `Basic ${Buffer.from(`${authConfig.username ?? ''}:${authConfig.password ?? ''}`).toString('base64')}`
  } else if (runtimeRequest.authType === 'apikey' && authConfig.keyLocation === 'header' && authConfig.keyName && authConfig.keyValue) {
    finalHeaders[authConfig.keyName] = authConfig.keyValue
  } else if (runtimeRequest.authType === 'oauth2' && authConfig.accessToken) {
    finalHeaders.Authorization = `${authConfig.tokenType ?? 'Bearer'} ${authConfig.accessToken}`
  }

  if (useCookieJar && !finalHeaders.Cookie) {
    const cookieHeader = buildCookieHeader(cookieJar, new URL(finalUrl).hostname)
    if (cookieHeader) finalHeaders.Cookie = cookieHeader
  }

  let requestBody: string | FormData | Blob | undefined
  let requestBodyForHistory = ''
  if (runtimeRequest.bodyType === 'json') {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json'
    requestBody = runtimeRequest.body ?? ''
    requestBodyForHistory = runtimeRequest.body ?? ''
  } else if (runtimeRequest.bodyType === 'graphql') {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json'
    try {
      const payload = JSON.parse(runtimeRequest.body || '{}') as { query?: string; variables?: string; operationName?: string }
      requestBody = JSON.stringify({
        query: payload.query ?? '',
        variables: payload.variables ? JSON.parse(payload.variables) : {},
        operationName: payload.operationName || undefined,
      })
      requestBodyForHistory = String(requestBody)
    } catch {
      requestBody = JSON.stringify({ query: '', variables: {} })
      requestBodyForHistory = String(requestBody)
    }
  } else if (runtimeRequest.bodyType === 'form') {
    finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/x-www-form-urlencoded'
    try {
      const formRows = JSON.parse(runtimeRequest.body ?? '[]') as ApiVariableRow[]
      const params = new URLSearchParams()
      formRows.filter((row) => row.enabled && row.key).forEach((row) => params.append(row.key, row.value))
      requestBody = params.toString()
      requestBodyForHistory = requestBody
    } catch {
      requestBody = runtimeRequest.body ?? ''
      requestBodyForHistory = runtimeRequest.body ?? ''
    }
  } else if (runtimeRequest.bodyType === 'multipart') {
    const formData = new FormData()
    try {
      const formRows = JSON.parse(runtimeRequest.body ?? '[]') as ApiVariableRow[]
      formRows.filter((row) => row.enabled && row.key).forEach((row) => formData.append(row.key, row.value))
      requestBodyForHistory = JSON.stringify(formRows.filter((row) => row.enabled && row.key))
    } catch {
      requestBodyForHistory = '[]'
    }
    requestBody = formData
    delete finalHeaders['Content-Type']
  } else if (runtimeRequest.bodyType === 'binary') {
    try {
      const payload = JSON.parse(runtimeRequest.body || '{}') as BinaryBodyPayload
      requestBody = new Blob([Buffer.from(payload.data ?? '', 'base64')], { type: payload.mimeType || 'application/octet-stream' })
      if (payload.mimeType) finalHeaders['Content-Type'] = payload.mimeType
      requestBodyForHistory = `[binary:${payload.fileName ?? 'upload'}]`
    } catch {
      requestBody = new Blob([])
      requestBodyForHistory = '[binary:invalid]'
    }
  } else if (runtimeRequest.bodyType === 'raw') {
    requestBody = runtimeRequest.body ?? ''
    requestBodyForHistory = runtimeRequest.body ?? ''
  }

  const startTime = Date.now()
  const fetchOptions: RequestInit = {
    method: runtimeRequest.method ?? 'GET',
    headers: finalHeaders,
    signal: input.signal ? AbortSignal.any([AbortSignal.timeout(30000), input.signal]) : AbortSignal.timeout(30000),
  }
  if (requestBody !== undefined && runtimeRequest.method !== 'GET' && runtimeRequest.method !== 'HEAD') {
    fetchOptions.body = requestBody
  }

  let response: Response
  try {
    const fetched = await fetchWithSafeRedirects(finalUrl, fetchOptions)
    response = fetched.response
    finalUrl = fetched.finalUrl
  } catch (error) {
    if (error instanceof ProxyTargetError) {
      return { ok: false as const, status: 400, error: error.message }
    }
    throw error
  }
  const duration = Date.now() - startTime
  const responseBuffer = await response.arrayBuffer()
  const totalSize = responseBuffer.byteLength
  let responseBodyText: string
  let truncated = false
  if (totalSize > MAX_BODY_SIZE) {
    responseBodyText = new TextDecoder().decode(responseBuffer.slice(0, MAX_BODY_SIZE))
    responseBodyText += `\n\n[Response truncated — showing first 1MB of ${(totalSize / 1024 / 1024).toFixed(2)}MB]`
    truncated = true
  } else {
    responseBodyText = new TextDecoder().decode(responseBuffer)
  }

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => { responseHeaders[key] = value })

  if (useCookieJar && typeof response.headers.getSetCookie === 'function') {
    const setCookies = response.headers.getSetCookie()
    if (setCookies.length > 0) {
      const jarHost = new URL(finalUrl).hostname
      const jarForHost = cookieJar[jarHost] ?? {}
      for (const rawCookie of setCookies) {
        const pair = extractCookiePair(rawCookie)
        if (pair) jarForHost[pair.name] = pair.value
      }
      cookieJar[jarHost] = jarForHost
      await writeCookieJar(input.workspaceId, cookieJar)
    }
  }

  const testExecution = executeApiScripts({
    request: runtimeRequest,
    preRequestScript: input.preRequestScript,
    testScript: input.testScript,
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBodyText,
      duration,
      size: responseBuffer.byteLength,
    },
  })
  const consoleLogs = [...preRequestExecution.consoleLogs, ...testExecution.consoleLogs]
  const testResults = testExecution.testResults
  const mappingResults = await applyResponseMappings({
    requestId: input.requestId ?? null,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId ?? null,
    responseBody: responseBodyText,
    responseMappings: input.responseMappings ?? [],
  })

  await (prisma.apiHistory as any).create({
    data: {
      workspaceId: input.workspaceId,
      requestId: input.requestId ?? null,
      method: runtimeRequest.method ?? 'GET',
      url: finalUrl,
      requestHeaders: JSON.stringify(finalHeaders),
      requestBody: requestBodyForHistory,
      status: response.status,
      statusText: response.statusText,
      duration,
      size: truncated ? totalSize : responseBuffer.byteLength,
      responseHeaders: JSON.stringify(responseHeaders),
      responseBody: responseBodyText,
      consoleLogs: JSON.stringify(consoleLogs),
      testResults: JSON.stringify(testResults),
    },
  }).catch(() => {})

  return {
    ok: true as const,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBodyText,
    duration,
    size: responseBuffer.byteLength,
    truncated,
    variables: materialized.variables,
    cookieJarHost: useCookieJar ? new URL(finalUrl).hostname : null,
    consoleLogs,
    testResults,
    mappingResults,
  }
}
