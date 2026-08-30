import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  materializeApiRequest,
  parseResponseMappingRows,
  parseVariableRows,
  stringifyVariableRows,
  type ApiResponseMappingRow,
  type ApiVariableRow,
  type ApiMaterializedRequest,
} from '../src/lib/apiRequestMaterialization'
import {
  clearDirectoryContents,
  ensureDesktopWorkspaceLayout,
  getApiCollectionFolderName,
  getApiRequestFileName,
  getDesktopWorkspaceLayout,
  writeJsonFile,
} from '../src/lib/workspaceLayout'
import { resolveApiAuthConfig, vaultApiAuthConfig } from '../src/lib/secrets/apiAuth'
import { apiGlobalsSettingKey, LEGACY_API_GLOBALS_KEY } from '../src/lib/apiWorkspace'
import { createDesktopActorContext } from '../src/lib/runtime/trustedContext'
import { fetchWithSafeRedirects, ProxyTargetError } from '../src/lib/proxyTarget'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

const MAX_BODY_SIZE = 1024 * 1024
const COOKIE_JAR_KEY_PREFIX = 'api_cookie_jar:'

type ApiCollectionDto = {
  id: string
  name: string
  description: string
  variables: string
  request_count: number
  created_at: string
  updated_at: string
}

type ApiEnvironmentDto = {
  id: string
  name: string
  variables: string
  created_at: string
  updated_at: string
}

type ApiRequestDto = {
  id: string
  name: string
  method: string
  url: string
  headers: string
  query_params: string
  variables: string
  request_options: string
  pre_request_script: string
  test_script: string
  response_mappings: string
  body_type: string
  body: string
  auth_type: string
  auth_config: string
  collection_id: string | null
  created_at: string
  updated_at: string
}

type ApiHistoryDto = {
  id: string
  request_id: string | null
  method: string
  url: string
  request_headers: string
  request_body: string
  status: number
  status_text: string
  duration: number
  size: number
  response_headers: string
  response_body: string
  console_logs: string
  test_results: string
  created_at: string
}

type ApiCollectionRunDto = {
  id: string
  collection_id: string
  collection_name: string
  environment_id: string | null
  environment_name: string | null
  status: string
  total_requests: number
  passed_requests: number
  failed_requests: number
  results: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
}

type ApiConsoleLogEntry = {
  phase: 'pre-request' | 'test'
  level: 'log' | 'warn' | 'error'
  message: string
}

type ApiTestResult = {
  name: string
  passed: boolean
  message: string
}

type ScriptResponseView = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number
  size: number
}

type AuthConfig = {
  token?: string
  username?: string
  password?: string
  keyName?: string
  keyValue?: string
  keyLocation?: 'header' | 'query'
  accessToken?: string
  tokenType?: string
}

type BinaryBodyPayload = {
  fileName?: string
  mimeType?: string
  data?: string
}

type CookieJarStore = Record<string, Record<string, string>>

export type DesktopApiRequestInput = {
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
  bodyType: 'none' | 'json' | 'form' | 'raw' | 'graphql' | 'multipart' | 'binary'
  body: string
  authType: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2'
  authConfig: Record<string, string>
}

function stringifyConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function createAssertionApi() {
  return (actual: unknown) => ({
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`)
      }
    },
    toContain(expected: unknown) {
      const value = String(actual)
      if (!value.includes(String(expected))) {
        throw new Error(`Expected ${value} to contain ${String(expected)}`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error('Expected value to be truthy')
      }
    },
  })
}

function runVmScript(code: string, context: vm.Context) {
  if (!code.trim()) return
  const script = new vm.Script(code)
  script.runInContext(context, { timeout: 1000 })
}

function executeApiScripts({
  request,
  preRequestScript,
  testScript,
  response,
}: {
  request: ApiMaterializedRequest
  preRequestScript?: string
  testScript?: string
  response?: ScriptResponseView
}) {
  const consoleLogs: ApiConsoleLogEntry[] = []
  const testResults: ApiTestResult[] = []
  const runtimeRequest: ApiMaterializedRequest = JSON.parse(JSON.stringify(request))
  const runtimeVariables = {
    request: new Map<string, string>(),
    environment: new Map<string, string>(),
    global: new Map<string, string>(),
  }

  const makeConsole = (phase: 'pre-request' | 'test') => ({
    log: (...args: unknown[]) => consoleLogs.push({ phase, level: 'log', message: args.map(stringifyConsoleArg).join(' ') }),
    warn: (...args: unknown[]) => consoleLogs.push({ phase, level: 'warn', message: args.map(stringifyConsoleArg).join(' ') }),
    error: (...args: unknown[]) => consoleLogs.push({ phase, level: 'error', message: args.map(stringifyConsoleArg).join(' ') }),
  })

  const makeVarsApi = () => ({
    get(scope: 'request' | 'environment' | 'global', name: string) {
      return runtimeVariables[scope].get(name)
    },
    set(scope: 'request' | 'environment' | 'global', name: string, value: string) {
      runtimeVariables[scope].set(name, String(value))
    },
  })

  const preRequestContext = vm.createContext({
    request: runtimeRequest,
    vars: makeVarsApi(),
    console: makeConsole('pre-request'),
  })
  runVmScript(preRequestScript ?? '', preRequestContext)

  if (response) {
    const testContext = vm.createContext({
      request: runtimeRequest,
      response,
      vars: makeVarsApi(),
      console: makeConsole('test'),
      test(name: string, fn: () => void) {
        try {
          fn()
          testResults.push({ name, passed: true, message: 'Passed' })
        } catch (error) {
          testResults.push({
            name,
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
      expect: createAssertionApi(),
    })
    runVmScript(testScript ?? '', testContext)
  }

  return { request: runtimeRequest, consoleLogs, testResults }
}

async function readApiGlobalsSetting(workspaceId: string) {
  const scoped = await prisma.setting.findUnique({ where: { key: apiGlobalsSettingKey(workspaceId) } })
  if (scoped || workspaceId !== 'default') return scoped
  return prisma.setting.findUnique({ where: { key: LEGACY_API_GLOBALS_KEY } })
}

async function readCookieJar(workspaceId: string): Promise<CookieJarStore> {
  const setting = await prisma.setting.findUnique({ where: { key: `${COOKIE_JAR_KEY_PREFIX}${workspaceId}` } })
  if (!setting?.value) return {}
  try {
    return JSON.parse(setting.value) as CookieJarStore
  } catch {
    return {}
  }
}

async function writeCookieJar(workspaceId: string, jar: CookieJarStore) {
  await prisma.setting.upsert({
    where: { key: `${COOKIE_JAR_KEY_PREFIX}${workspaceId}` },
    update: { value: JSON.stringify(jar) },
    create: { key: `${COOKIE_JAR_KEY_PREFIX}${workspaceId}`, value: JSON.stringify(jar) },
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

function getValueAtPath(input: unknown, targetPath: string): unknown {
  if (!targetPath.trim()) return undefined
  const segments = targetPath.split('.').map((segment) => segment.trim()).filter(Boolean)
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

  await syncApiWorkspaceToDisk(workspaceId)

  return updates
}

function serializeApiCollection(collection: any): ApiCollectionDto {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    variables: collection.variables,
    request_count: collection._count?.requests ?? 0,
    created_at: collection.createdAt.toISOString(),
    updated_at: collection.updatedAt.toISOString(),
  }
}

function serializeApiRequest(request: any): ApiRequestDto {
  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers,
    query_params: request.queryParams,
    variables: request.variables,
    request_options: request.requestOptions,
    pre_request_script: request.preRequestScript,
    test_script: request.testScript,
    response_mappings: request.responseMappings,
    body_type: request.bodyType,
    body: request.body,
    auth_type: request.authType,
    auth_config: request.authConfig,
    collection_id: request.collectionId ?? null,
    created_at: request.createdAt.toISOString(),
    updated_at: request.updatedAt.toISOString(),
  }
}

function serializeApiEnvironment(environment: any): ApiEnvironmentDto {
  return {
    id: environment.id,
    name: environment.name,
    variables: environment.variables,
    created_at: environment.createdAt.toISOString(),
    updated_at: environment.updatedAt.toISOString(),
  }
}

function serializeApiHistory(entry: any): ApiHistoryDto {
  return {
    id: entry.id,
    request_id: entry.requestId ?? null,
    method: entry.method,
    url: entry.url,
    request_headers: entry.requestHeaders,
    request_body: entry.requestBody,
    status: entry.status,
    status_text: entry.statusText,
    duration: entry.duration,
    size: entry.size,
    response_headers: entry.responseHeaders,
    response_body: entry.responseBody,
    console_logs: entry.consoleLogs,
    test_results: entry.testResults,
    created_at: entry.createdAt.toISOString(),
  }
}

function serializeApiCollectionRun(run: any): ApiCollectionRunDto {
  return {
    id: run.id,
    collection_id: run.collectionId,
    collection_name: run.collectionName,
    environment_id: run.environmentId ?? null,
    environment_name: run.environmentName ?? null,
    status: run.status,
    total_requests: run.totalRequests,
    passed_requests: run.passedRequests,
    failed_requests: run.failedRequests,
    results: run.results,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
    duration_ms: run.durationMs ?? null,
  }
}

async function getConfiguredWorkspaceRoot() {
  const setting = await prisma.setting.findUnique({ where: { key: 'script_storage_path' } })
  return setting?.value?.trim() || process.env.SCRIPTS_DIR || path.join(process.cwd(), 'user_scripts')
}

async function getApiWorkspaceLayout() {
  const layout = getDesktopWorkspaceLayout(await getConfiguredWorkspaceRoot())
  ensureDesktopWorkspaceLayout(layout)
  return layout
}

async function syncApiWorkspaceToDisk(workspaceId = 'default') {
  const layout = await getApiWorkspaceLayout()
  const [collections, requests, environments, globalSetting] = await Promise.all([
    prisma.apiCollection.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { requests: true } } },
    }),
    (prisma.apiRequest as any).findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
    }) as Promise<any[]>,
    prisma.apiEnvironment.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } }),
    readApiGlobalsSetting(workspaceId),
  ])

  clearDirectoryContents(layout.apiCollectionsRoot, [
    path.basename(layout.apiSharedRoot),
    path.basename(layout.apiUnfiledRoot),
  ])
  clearDirectoryContents(path.join(layout.apiUnfiledRoot, 'requests'))

  writeJsonFile(path.join(layout.apiSharedRoot, 'environments.json'), environments.map(serializeApiEnvironment))
  writeJsonFile(path.join(layout.apiSharedRoot, 'globals.json'), {
    variables: globalSetting?.value ?? '[]',
  })

  const requestsByCollection = new Map<string, any[]>()
  const unfiledRequests: any[] = []
  for (const request of requests) {
    if (request.collectionId) {
      const bucket = requestsByCollection.get(request.collectionId) ?? []
      bucket.push(request)
      requestsByCollection.set(request.collectionId, bucket)
    } else {
      unfiledRequests.push(request)
    }
  }

  for (const collection of collections) {
    const folderPath = path.join(layout.apiRoot, getApiCollectionFolderName(collection.name, collection.id))
    const requestsDir = path.join(folderPath, 'requests')
    fs.mkdirSync(requestsDir, { recursive: true })
    writeJsonFile(path.join(folderPath, 'collection.json'), serializeApiCollection(collection))
    for (const request of requestsByCollection.get(collection.id) ?? []) {
      writeJsonFile(
        path.join(requestsDir, getApiRequestFileName(request.name, request.id)),
        serializeApiRequest(request)
      )
    }
  }

  for (const request of unfiledRequests) {
    writeJsonFile(
      path.join(layout.apiUnfiledRoot, 'requests', getApiRequestFileName(request.name, request.id)),
      serializeApiRequest(request)
    )
  }
}

export async function listApiCollections(): Promise<ApiCollectionDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const collections = await prisma.apiCollection.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { requests: true } } },
  })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return collections.map(serializeApiCollection)
}

export async function saveApiCollection(payload: { id?: string; name: string; description?: string; variables?: string }) {
  const actor = await createDesktopActorContext(prisma)
  if (!payload.name?.trim()) {
    throw new Error('Name is required')
  }
  if (payload.id) {
    const existing = await prisma.apiCollection.findFirst({ where: { id: payload.id, workspaceId: actor.workspaceId } })
    if (!existing) throw new Error('Collection not found')
  }
  const record = payload.id
    ? await prisma.apiCollection.update({
      where: { id: payload.id },
      data: { name: payload.name.trim(), description: payload.description ?? '', variables: payload.variables ?? '[]' },
      include: { _count: { select: { requests: true } } },
    })
    : await prisma.apiCollection.create({
      data: { workspaceId: actor.workspaceId, name: payload.name.trim(), description: payload.description ?? '', variables: payload.variables ?? '[]' },
      include: { _count: { select: { requests: true } } },
    })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return serializeApiCollection(record)
}

export async function deleteApiCollection(id: string) {
  const actor = await createDesktopActorContext(prisma)
  const deleted = await prisma.apiCollection.deleteMany({ where: { id, workspaceId: actor.workspaceId } })
  if (deleted.count === 0) throw new Error('Collection not found')
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return id
}

export async function listApiRequests(collectionId?: string | null): Promise<ApiRequestDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const requests = await (prisma.apiRequest as any).findMany({
    where: { workspaceId: actor.workspaceId, ...(collectionId ? { collectionId } : {}) },
    orderBy: { updatedAt: 'desc' },
  }) as any[]
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return requests.map(serializeApiRequest)
}

export async function getApiRequest(id: string): Promise<ApiRequestDto | null> {
  const actor = await createDesktopActorContext(prisma)
  const request = await (prisma.apiRequest as any).findFirst({ where: { id, workspaceId: actor.workspaceId } }) as any
  return request ? serializeApiRequest(request) : null
}

export async function saveApiRequest(payload: Record<string, any>): Promise<ApiRequestDto> {
  const actor = await createDesktopActorContext(prisma)
  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    throw new Error('Name is required')
  }
  const requestId = payload.id ?? randomUUID()
  if (payload.id) {
    const existing = await (prisma.apiRequest as any).findFirst({ where: { id: payload.id, workspaceId: actor.workspaceId } }) as any
    if (!existing) throw new Error('Request not found')
  }
  if (payload.collection_id) {
    const collection = await prisma.apiCollection.findFirst({ where: { id: payload.collection_id, workspaceId: actor.workspaceId } })
    if (!collection) throw new Error('Collection not found')
  }
  const data = {
    workspaceId: actor.workspaceId,
    name: payload.name.trim(),
    method: payload.method ?? 'GET',
    url: payload.url ?? '',
    headers: payload.headers ?? '[]',
    queryParams: payload.query_params ?? '[]',
    variables: payload.variables ?? '[]',
    requestOptions: payload.request_options ?? '{}',
    preRequestScript: payload.pre_request_script ?? '',
    testScript: payload.test_script ?? '',
    responseMappings: payload.response_mappings ?? '[]',
    bodyType: payload.body_type ?? 'none',
    body: payload.body ?? '',
    authType: payload.auth_type ?? 'none',
    authConfig: await vaultApiAuthConfig(prisma, requestId, payload.auth_config ?? '{}', { workspaceId: actor.workspaceId, actorId: actor.actorId }),
    collectionId: payload.collection_id ?? null,
  }
  const request = payload.id
    ? await (prisma.apiRequest as any).update({ where: { id: payload.id }, data })
    : await (prisma.apiRequest as any).create({ data: { id: requestId, ...data } })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return serializeApiRequest(request)
}

export async function deleteApiRequest(id: string) {
  const actor = await createDesktopActorContext(prisma)
  const deleted = await prisma.apiRequest.deleteMany({ where: { id, workspaceId: actor.workspaceId } })
  if (deleted.count === 0) throw new Error('Request not found')
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return id
}

export async function listApiEnvironments(): Promise<ApiEnvironmentDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const environments = await prisma.apiEnvironment.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { name: 'asc' } })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return environments.map(serializeApiEnvironment)
}

export async function saveApiEnvironment(payload: { id?: string; name: string; variables?: string }) {
  const actor = await createDesktopActorContext(prisma)
  if (!payload.name?.trim()) {
    throw new Error('Name is required')
  }
  if (payload.id) {
    const existing = await prisma.apiEnvironment.findFirst({ where: { id: payload.id, workspaceId: actor.workspaceId } })
    if (!existing) throw new Error('Environment not found')
  }
  const environment = payload.id
    ? await prisma.apiEnvironment.update({
      where: { id: payload.id },
      data: { name: payload.name.trim(), variables: payload.variables ?? '[]' },
    })
    : await prisma.apiEnvironment.create({
      data: { workspaceId: actor.workspaceId, name: payload.name.trim(), variables: payload.variables ?? '[]' },
    })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return serializeApiEnvironment(environment)
}

export async function deleteApiEnvironment(id: string) {
  const actor = await createDesktopActorContext(prisma)
  const deleted = await prisma.apiEnvironment.deleteMany({ where: { id, workspaceId: actor.workspaceId } })
  if (deleted.count === 0) throw new Error('Environment not found')
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return id
}

export async function readApiGlobals() {
  const actor = await createDesktopActorContext(prisma)
  const setting = await readApiGlobalsSetting(actor.workspaceId)
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return { variables: setting?.value ?? '[]' }
}

export async function saveApiGlobals(variables: string) {
  const actor = await createDesktopActorContext(prisma)
  const key = apiGlobalsSettingKey(actor.workspaceId)
  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: variables ?? '[]' },
    create: { key, value: variables ?? '[]' },
  })
  await syncApiWorkspaceToDisk(actor.workspaceId)
  return { variables: setting.value ?? '[]' }
}

export async function listApiHistory(): Promise<ApiHistoryDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const history = await (prisma.apiHistory as any).findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }) as any[]
  return history.map(serializeApiHistory)
}

export async function clearApiHistory() {
  const actor = await createDesktopActorContext(prisma)
  await prisma.apiHistory.deleteMany({ where: { workspaceId: actor.workspaceId } })
  return { success: true }
}

export async function listApiCollectionRuns(): Promise<ApiCollectionRunDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const runs = await (prisma.apiCollectionRun as any).findMany({
    where: { collection: { workspaceId: actor.workspaceId } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  }) as any[]
  return runs.map(serializeApiCollectionRun)
}

async function executeDesktopApiRequest(input: DesktopApiRequestInput) {
  const [environment, collection, globalSetting] = await Promise.all([
    input.environmentId ? prisma.apiEnvironment.findFirst({ where: { id: input.environmentId, workspaceId: input.workspaceId } }) : Promise.resolve(null),
    input.collectionId ? prisma.apiCollection.findFirst({ where: { id: input.collectionId, workspaceId: input.workspaceId } }) : Promise.resolve(null),
    readApiGlobalsSetting(input.workspaceId),
  ])

  const runtimeAuthConfig = input.requestId
    ? await resolveApiAuthConfig(prisma, input.requestId, input.authConfig ?? {}, { workspaceId: input.workspaceId, actorId: 'desktop-api-runtime' })
    : input.authConfig ?? {}
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
      authConfig: runtimeAuthConfig,
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
    // ignore invalid URL mutation
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
    signal: AbortSignal.timeout(30000),
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

  if (useCookieJar) {
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      const jarHost = new URL(finalUrl).hostname
      const jarForHost = cookieJar[jarHost] ?? {}
      for (const rawCookie of setCookie.split(',')) {
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
  }).catch(() => undefined)

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

export async function sendApiRequest(payload: Omit<DesktopApiRequestInput, 'workspaceId'>) {
  const actor = await createDesktopActorContext(prisma)
  const result = await executeDesktopApiRequest({ ...payload, workspaceId: actor.workspaceId })
  if (!result.ok) {
    return result
  }

  let refreshedRequest: ApiRequestDto | undefined
  let refreshedGlobals: { variables: string } | undefined
  let refreshedEnvironments: ApiEnvironmentDto[] | undefined
  const mappingApplied = Array.isArray(result.mappingResults) && result.mappingResults.some((item) => item?.applied)
  if (mappingApplied) {
    const [globalsRecord, environments, requestRecord] = await Promise.all([
      readApiGlobals(),
      listApiEnvironments(),
      payload.requestId ? getApiRequest(payload.requestId) : Promise.resolve(null),
    ])
    refreshedGlobals = globalsRecord
    refreshedEnvironments = environments
    refreshedRequest = requestRecord ?? undefined
  }

  return {
    response: {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
      body: result.body,
      duration: result.duration,
      size: result.size,
      truncated: result.truncated,
      cookieJarHost: result.cookieJarHost,
      consoleLogs: result.consoleLogs,
      testResults: result.testResults,
      mappingResults: result.mappingResults,
      timestamp: Date.now(),
    },
    refreshedRequest,
    refreshedGlobals,
    refreshedEnvironments,
  }
}

export async function runApiCollection(payload: { collectionId: string; environmentId: string | null }) {
  const actor = await createDesktopActorContext(prisma)
  const collection = await prisma.apiCollection.findFirst({ where: { id: payload.collectionId, workspaceId: actor.workspaceId } })
  const environment = payload.environmentId
    ? await prisma.apiEnvironment.findFirst({ where: { id: payload.environmentId, workspaceId: actor.workspaceId } })
    : null

  if (!collection) {
    throw new Error('Collection not found')
  }

  const requests = await (prisma.apiRequest as any).findMany({
    where: { collectionId: payload.collectionId, workspaceId: actor.workspaceId },
    orderBy: { createdAt: 'asc' },
  }) as any[]

  if (requests.length === 0) {
    throw new Error('Collection has no requests')
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
      const result = await executeDesktopApiRequest({
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
        authConfig: await resolveApiAuthConfig(prisma, request.id, (() => { try { return JSON.parse(request.authConfig) } catch { return {} } })(), { workspaceId: actor.workspaceId, actorId: actor.actorId }),
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

  return serializeApiCollectionRun(updated)
}
