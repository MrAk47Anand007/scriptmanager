import type { ApiRequestDraft, KeyValueRow } from '@/features/api/apiSlice'

/**
 * Build a cURL command from a request draft. Values are exported RAW —
 * {{variables}} are kept as-is and not resolved.
 */

function shellQuote(value: string): string {
  // Single-quote, escaping embedded single quotes via '\''
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function enabledRows(rows: KeyValueRow[] | undefined): KeyValueRow[] {
  return (rows ?? []).filter((row) => row.enabled && row.key)
}

function parseKeyValueBody(body: string): KeyValueRow[] {
  try {
    const parsed = JSON.parse(body) as KeyValueRow[]
    return Array.isArray(parsed) ? parsed.filter((row) => row && typeof row.key === 'string') : []
  } catch {
    return []
  }
}

function appendQueryParams(url: string, rows: KeyValueRow[]): string {
  if (rows.length === 0) return url
  const pairs = rows
    .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
    .join('&')
  // Restore {{var}} delimiters that encodeURIComponent mangled, keeping raw variables intact.
  const restored = pairs.replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}')
  return url.includes('?') ? `${url}&${restored}` : `${url}?${restored}`
}

export function buildCurl(draft: ApiRequestDraft): string {
  const parts: string[] = []
  const method = (draft.method || 'GET').toUpperCase()

  let url = appendQueryParams(draft.url, enabledRows(draft.queryParams))

  parts.push(`curl -X ${method} ${shellQuote(url)}`)

  // Headers (raw, unresolved)
  const headers = enabledRows(draft.headers)
  const hasHeader = (name: string) =>
    headers.some((row) => row.key.toLowerCase() === name.toLowerCase())

  for (const header of headers) {
    parts.push(`-H ${shellQuote(`${header.key}: ${header.value}`)}`)
  }

  // Auth
  const auth = draft.authConfig ?? {}
  switch (draft.authType) {
    case 'bearer':
      if (!hasHeader('Authorization')) {
        parts.push(`-H ${shellQuote(`Authorization: Bearer ${auth.token ?? ''}`)}`)
      }
      break
    case 'basic':
      parts.push(`-u ${shellQuote(`${auth.username ?? ''}:${auth.password ?? ''}`)}`)
      break
    case 'apikey': {
      const keyName = auth.keyName ?? ''
      const keyValue = auth.keyValue ?? ''
      if (keyName) {
        if ((auth.keyLocation ?? 'header') === 'query') {
          const separator = url.includes('?') ? '&' : '?'
          url = `${url}${separator}${encodeURIComponent(keyName)}=${encodeURIComponent(keyValue)}`
            .replace(/%7B%7B/g, '{{')
            .replace(/%7D%7D/g, '}}')
          parts[0] = `curl -X ${method} ${shellQuote(url)}`
        } else {
          parts.push(`-H ${shellQuote(`${keyName}: ${keyValue}`)}`)
        }
      }
      break
    }
    case 'oauth2': {
      if (!hasHeader('Authorization')) {
        const tokenType = auth.tokenType || 'Bearer'
        parts.push(`-H ${shellQuote(`Authorization: ${tokenType} ${auth.accessToken ?? ''}`)}`)
      }
      break
    }
    default:
      break
  }

  // Body
  switch (draft.bodyType) {
    case 'json':
      if (!hasHeader('Content-Type')) {
        parts.push(`-H ${shellQuote('Content-Type: application/json')}`)
      }
      if (draft.body) parts.push(`--data ${shellQuote(draft.body)}`)
      break
    case 'raw':
      if (draft.body) parts.push(`--data ${shellQuote(draft.body)}`)
      break
    case 'form': {
      const rows = parseKeyValueBody(draft.body).filter((row) => row.enabled !== false && row.key)
      for (const row of rows) {
        parts.push(`--data-urlencode ${shellQuote(`${row.key}=${row.value}`)}`)
      }
      break
    }
    case 'multipart': {
      const rows = parseKeyValueBody(draft.body).filter((row) => row.enabled !== false && row.key)
      for (const row of rows) {
        parts.push(`--form ${shellQuote(`${row.key}=${row.value}`)}`)
      }
      break
    }
    case 'graphql': {
      try {
        const parsed = JSON.parse(draft.body) as { query?: string; variables?: string }
        let variables: unknown = {}
        try {
          variables = parsed.variables ? JSON.parse(parsed.variables) : {}
        } catch {
          variables = {}
        }
        if (!hasHeader('Content-Type')) {
          parts.push(`-H ${shellQuote('Content-Type: application/json')}`)
        }
        parts.push(`--data ${shellQuote(JSON.stringify({ query: parsed.query ?? '', variables }))}`)
      } catch {
        if (draft.body) parts.push(`--data ${shellQuote(draft.body)}`)
      }
      break
    }
    case 'binary': {
      try {
        const parsed = JSON.parse(draft.body) as { fileName?: string }
        parts.push(`--data-binary ${shellQuote(`@${parsed.fileName || 'file'}`)} # replace with local file path`)
      } catch {
        parts.push(`--data-binary '@file' # replace with local file path`)
      }
      break
    }
    case 'none':
    default:
      break
  }

  return parts.join(' \\\n  ')
}
