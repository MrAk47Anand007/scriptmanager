import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const MAX_BODY_SIZE = 1024 * 1024 // 1MB

interface KeyValueRow {
  key: string
  value: string
  enabled: boolean
}

interface AuthConfig {
  token?: string
  username?: string
  password?: string
  keyName?: string
  keyValue?: string
  keyLocation?: 'header' | 'query'
}

export async function POST(req: Request) {
  try {
    const { method, url, headers, queryParams, bodyType, body, authType, authConfig } = await req.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Build URL with enabled query params
    let finalUrl = url
    try {
      const parsedUrl = new URL(url)

      // Add enabled query params
      if (Array.isArray(queryParams)) {
        const enabledParams = (queryParams as KeyValueRow[]).filter(p => p.enabled && p.key)

        // Inject apikey in query if needed
        if (authType === 'apikey') {
          const config = (authConfig ?? {}) as AuthConfig
          if (config.keyLocation === 'query' && config.keyName && config.keyValue) {
            parsedUrl.searchParams.set(config.keyName, config.keyValue)
          }
        }

        enabledParams.forEach(p => parsedUrl.searchParams.append(p.key, p.value))
      }

      finalUrl = parsedUrl.toString()
    } catch {
      // If URL is invalid, use as-is (will fail during fetch)
    }

    // Build headers object from enabled rows
    const finalHeaders: Record<string, string> = {}

    if (Array.isArray(headers)) {
      const enabledHeaders = (headers as KeyValueRow[]).filter(h => h.enabled && h.key)
      enabledHeaders.forEach(h => {
        finalHeaders[h.key] = h.value
      })
    }

    // Inject auth headers
    if (authType === 'bearer') {
      const config = (authConfig ?? {}) as AuthConfig
      if (config.token) {
        finalHeaders['Authorization'] = `Bearer ${config.token}`
      }
    } else if (authType === 'basic') {
      const config = (authConfig ?? {}) as AuthConfig
      if (config.username !== undefined || config.password !== undefined) {
        const encoded = Buffer.from(`${config.username ?? ''}:${config.password ?? ''}`).toString('base64')
        finalHeaders['Authorization'] = `Basic ${encoded}`
      }
    } else if (authType === 'apikey') {
      const config = (authConfig ?? {}) as AuthConfig
      if (config.keyLocation === 'header' && config.keyName && config.keyValue) {
        finalHeaders[config.keyName] = config.keyValue
      }
    }

    // Build request body
    let requestBody: string | undefined = undefined

    if (bodyType === 'json') {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json'
      requestBody = body ?? ''
    } else if (bodyType === 'form') {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/x-www-form-urlencoded'
      try {
        const formRows = JSON.parse(body ?? '[]') as KeyValueRow[]
        const params = new URLSearchParams()
        formRows.filter(r => r.enabled && r.key).forEach(r => params.append(r.key, r.value))
        requestBody = params.toString()
      } catch {
        requestBody = body ?? ''
      }
    } else if (bodyType === 'raw') {
      requestBody = body ?? ''
    }

    // Make the request with 30 second timeout
    const startTime = Date.now()

    const fetchOptions: RequestInit = {
      method: method ?? 'GET',
      headers: finalHeaders,
      signal: AbortSignal.timeout(30000)
    }

    if (requestBody !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = requestBody
    }

    const response = await fetch(finalUrl, fetchOptions)
    const duration = Date.now() - startTime

    // Read response body, capped at 1MB
    const responseBuffer = await response.arrayBuffer()
    const totalSize = responseBuffer.byteLength
    let responseBodyText: string
    let truncated = false

    if (totalSize > MAX_BODY_SIZE) {
      const truncatedBuffer = responseBuffer.slice(0, MAX_BODY_SIZE)
      responseBodyText = new TextDecoder().decode(truncatedBuffer)
      responseBodyText += `\n\n[Response truncated — showing first 1MB of ${(totalSize / 1024 / 1024).toFixed(2)}MB]`
      truncated = true
    } else {
      responseBodyText = new TextDecoder().decode(responseBuffer)
    }

    // Collect response headers
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    // Save to history
    await prisma.apiHistory.create({
      data: {
        method: method ?? 'GET',
        url: finalUrl,
        requestHeaders: JSON.stringify(finalHeaders),
        requestBody: requestBody ?? '',
        status: response.status,
        statusText: response.statusText,
        duration,
        size: truncated ? totalSize : responseBuffer.byteLength,
        responseHeaders: JSON.stringify(responseHeaders),
        responseBody: responseBodyText
      }
    }).catch(() => {
      // Don't fail the request if history save fails
    })

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBodyText,
      duration,
      size: responseBuffer.byteLength,
      truncated
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message })
  }
}
