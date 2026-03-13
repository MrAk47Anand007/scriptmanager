import type { ApiRequestDraft, KeyValueRow } from '@/features/api/apiSlice'

export interface CurlImportAnalysis {
  draft: Partial<ApiRequestDraft>
  warnings: string[]
  summary: {
    method: string
    url: string
    headerCount: number
    queryCount: number
    bodyType: ApiRequestDraft['bodyType']
    authType: ApiRequestDraft['authType']
  }
}

const FLAGS_WITH_VALUES = new Set([
  '-X', '--request',
  '-H', '--header',
  '-u', '--user',
  '-b', '--cookie',
  '--url-query',
  '--data', '--data-raw', '--data-binary', '--data-urlencode', '-d',
  '--form', '-F',
  '--url',
  '-A', '--user-agent',
  '-e', '--referer',
  '--proxy',
  '--max-time',
  '--connect-timeout',
])

const STANDALONE_FLAGS = new Set([
  '--location',
  '-L',
  '--compressed',
  '--insecure',
  '-k',
  '--silent',
  '-s',
  '--include',
  '-i',
  '--head',
  '-I',
  '--get',
  '-G',
])

function blankRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true }
}

function ensureRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.length > 0 ? rows : [blankRow()]
}

function tokenizeCurl(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) quote = null
      else current += char
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function parseHeader(headerValue: string): KeyValueRow | null {
  const separatorIndex = headerValue.indexOf(':')
  if (separatorIndex === -1) return null

  const key = headerValue.slice(0, separatorIndex).trim()
  const value = headerValue.slice(separatorIndex + 1).trim()
  if (!key) return null

  return {
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }
}

function toFormRows(body: string): KeyValueRow[] {
  const params = new URLSearchParams(body)
  const rows: KeyValueRow[] = []
  params.forEach((value, key) => {
    rows.push({
      id: crypto.randomUUID(),
      key,
      value,
      enabled: true,
    })
  })
  return ensureRows(rows)
}

function mergeQueryIntoUrl(rawUrl: string, rows: KeyValueRow[]) {
  if (!rawUrl || rows.length === 0) return rawUrl
  try {
    const parsed = new URL(rawUrl)
    rows.filter((row) => row.key).forEach((row) => parsed.searchParams.append(row.key, row.value))
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

function detectBodyType(body: string, contentTypeHeader: string): ApiRequestDraft['bodyType'] {
  const contentType = contentTypeHeader.toLowerCase()
  if (contentType.includes('application/json')) return 'json'
  if (contentType.includes('application/x-www-form-urlencoded')) return 'form'
  if (contentType.includes('multipart/form-data')) return 'multipart'
  if (contentType.includes('application/graphql')) return 'graphql'

  const trimmed = body.trim()
  if (!trimmed) return 'none'
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return 'json'
  }
  if (trimmed.includes('=') && trimmed.includes('&')) {
    return 'form'
  }
  return 'raw'
}

function inferAuth(headers: KeyValueRow[], draft: Partial<ApiRequestDraft>) {
  const remainingHeaders: KeyValueRow[] = []
  const nextDraft = { ...draft }

  for (const header of headers) {
    if (header.key.toLowerCase() === 'authorization') {
      if (/^bearer\s+/i.test(header.value)) {
        nextDraft.authType = 'bearer'
        nextDraft.authConfig = { token: header.value.replace(/^bearer\s+/i, '') }
        continue
      }
      if (/^basic\s+/i.test(header.value)) {
        try {
          const decoded = atob(header.value.replace(/^basic\s+/i, ''))
          const separatorIndex = decoded.indexOf(':')
          nextDraft.authType = 'basic'
          nextDraft.authConfig = {
            username: separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex),
            password: separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1),
          }
          continue
        } catch {
          // fall through and keep the raw header
        }
      }
    }

    remainingHeaders.push(header)
  }

  nextDraft.headers = ensureRows(remainingHeaders)
  return nextDraft
}

export function analyzeCurlCommand(input: string): CurlImportAnalysis {
  const tokens = tokenizeCurl(input.replace(/\\\r?\n/g, ' '))
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    throw new Error('Paste a valid cURL command')
  }

  const warnings: string[] = []
  let method = 'GET'
  let url = ''
  const headers: KeyValueRow[] = []
  const queryRows: KeyValueRow[] = []
  let body = ''
  let bodyType: ApiRequestDraft['bodyType'] = 'none'
  let explicitMethod = false
  let authType: ApiRequestDraft['authType'] = 'none'
  let authConfig: Record<string, string> = {}
  let requestOptions: NonNullable<ApiRequestDraft['requestOptions']> = { useCookieJar: false }

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]
    if (!token) continue

    if (token === '-X' || token === '--request') {
      if (next) {
        method = next.toUpperCase()
        explicitMethod = true
        index += 1
      }
      continue
    }

    if (token === '--get' || token === '-G') {
      method = 'GET'
      explicitMethod = true
      continue
    }

    if (token === '--head' || token === '-I') {
      method = 'HEAD'
      explicitMethod = true
      continue
    }

    if (token === '-H' || token === '--header') {
      if (next) {
        const header = parseHeader(next)
        if (header) headers.push(header)
        index += 1
      }
      continue
    }

    if (token === '-u' || token === '--user') {
      if (next) {
        const separatorIndex = next.indexOf(':')
        authType = 'basic'
        authConfig = {
          username: separatorIndex === -1 ? next : next.slice(0, separatorIndex),
          password: separatorIndex === -1 ? '' : next.slice(separatorIndex + 1),
        }
        index += 1
      }
      continue
    }

    if (token === '-b' || token === '--cookie') {
      if (next) {
        headers.push({
          id: crypto.randomUUID(),
          key: 'Cookie',
          value: next,
          enabled: true,
        })
        requestOptions = { ...requestOptions, useCookieJar: true }
        index += 1
      }
      continue
    }

    if (token === '--url-query') {
      if (next) {
        queryRows.push(...toFormRows(next).filter((row) => row.key))
        index += 1
      }
      continue
    }

    if (token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-urlencode' || token === '-d') {
      if (next) {
        body = body ? `${body}&${next}` : next
        bodyType = 'raw'
        if (!explicitMethod && method === 'GET') method = 'POST'
        index += 1
      }
      continue
    }

    if (token === '--form' || token === '-F') {
      if (next) {
        const separatorIndex = next.indexOf('=')
        const key = separatorIndex === -1 ? next : next.slice(0, separatorIndex)
        const value = separatorIndex === -1 ? '' : next.slice(separatorIndex + 1)
        let rows: KeyValueRow[] = []
        try {
          rows = JSON.parse(body || '[]') as KeyValueRow[]
        } catch {
          rows = []
        }
        rows.push({
          id: crypto.randomUUID(),
          key,
          value,
          enabled: true,
        })
        body = JSON.stringify(rows)
        bodyType = 'multipart'
        if (!explicitMethod && method === 'GET') method = 'POST'
        index += 1
      }
      continue
    }

    if (token.startsWith('-')) {
      if (STANDALONE_FLAGS.has(token)) {
        continue
      }
      warnings.push(`Unsupported flag skipped: ${token}`)
      if (FLAGS_WITH_VALUES.has(token) && next && !next.startsWith('-')) {
        index += 1
      }
      continue
    }

    if (!url) {
      url = token
    }
  }

  if (!url) {
    throw new Error('Could not find a URL in the cURL command')
  }

  const contentTypeHeader = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value ?? ''
  if (bodyType === 'raw') {
    bodyType = detectBodyType(body, contentTypeHeader)
  }

  if (bodyType === 'form') {
    body = JSON.stringify(toFormRows(body))
  }

  if (bodyType === 'graphql') {
    body = JSON.stringify({
      query: body,
      variables: '{}',
      operationName: '',
    })
  }

  if (bodyType === 'none' && body) {
    bodyType = 'raw'
  }

  url = mergeQueryIntoUrl(url, queryRows)

  const inferred = inferAuth(headers, {
    method,
    url,
    headers: ensureRows(headers),
    body,
    bodyType,
    authType,
    authConfig,
    requestOptions,
  })

  const nextDraft: Partial<ApiRequestDraft> = {
    ...inferred,
    method,
    url,
    headers: inferred.headers ?? ensureRows(headers),
    body,
    bodyType,
    authType: inferred.authType ?? authType,
    authConfig: inferred.authConfig ?? authConfig,
    requestOptions,
  }

  return {
    draft: nextDraft,
    warnings,
    summary: {
      method,
      url,
      headerCount: (nextDraft.headers ?? []).filter((row) => row.key).length,
      queryCount: queryRows.filter((row) => row.key).length,
      bodyType,
      authType: (nextDraft.authType ?? 'none') as ApiRequestDraft['authType'],
    },
  }
}

export function parseCurlCommand(input: string): Partial<ApiRequestDraft> {
  return analyzeCurlCommand(input).draft
}
