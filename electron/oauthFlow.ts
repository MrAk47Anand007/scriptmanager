import http from 'http'
import crypto from 'crypto'
import { shell } from 'electron'
import type { AddressInfo } from 'net'

// Desktop OAuth 2.0 authorization-code flow with PKCE over a loopback
// redirect (RFC 8252). The user supplies their own OAuth Client ID, so no
// client secret ships with the app — PKCE makes one unnecessary.

export type OAuthFlowParams = {
  authUrl: string
  tokenUrl: string
  clientId: string
  scopes: string
  extraAuthParams?: Record<string, string>
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

export const OAUTH_ENDPOINTS = {
  gdrive: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://www.googleapis.com/auth/drive.file',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' },
  },
  onedrive: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: 'Files.ReadWrite offline_access',
    extraAuthParams: {},
  },
} as const

const CALLBACK_PATH = '/oauth/callback'
const FLOW_TIMEOUT_MS = 5 * 60 * 1000

const CALLBACK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>ScriptManager</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #efede7; color: #3a3835;">
<div style="text-align: center;"><h2 style="margin: 0 0 8px;">Sign-in complete</h2><p style="margin: 0;">You can close this window and return to ScriptManager.</p></div>
</body></html>`

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function postTokenRequest(tokenUrl: string, params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const data = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok || data.error) {
    throw new Error(
      data.error_description || data.error || `Token request failed with HTTP ${response.status}`
    )
  }
  return data
}

/**
 * Run a full PKCE authorization-code flow: open the system browser at the
 * provider's consent screen and capture the code via a temporary loopback
 * HTTP server. Resolves with tokens or rejects on timeout/denial.
 */
export async function runOAuthFlow(params: OAuthFlowParams): Promise<OAuthTokens> {
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  const server = http.createServer()

  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`

    const codePromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('OAuth flow timed out after 5 minutes'))
      }, FLOW_TIMEOUT_MS)

      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_HTML)

        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')

        clearTimeout(timer)
        if (error) {
          reject(new Error(`Authorization failed: ${url.searchParams.get('error_description') || error}`))
        } else if (returnedState !== state) {
          reject(new Error('OAuth state mismatch — possible CSRF, aborting'))
        } else if (!code) {
          reject(new Error('No authorization code returned'))
        } else {
          resolve(code)
        }
      })
    })

    const authUrl = new URL(params.authUrl)
    authUrl.searchParams.set('client_id', params.clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', params.scopes)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    for (const [key, value] of Object.entries(params.extraAuthParams ?? {})) {
      authUrl.searchParams.set(key, value)
    }

    await shell.openExternal(authUrl.toString())
    const code = await codePromise

    const data = await postTokenRequest(params.tokenUrl, {
      grant_type: 'authorization_code',
      code,
      client_id: params.clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })

    if (!data.access_token) {
      throw new Error('Token response did not include an access token')
    }
    if (!data.refresh_token) {
      throw new Error(
        'Token response did not include a refresh token — for Google, ensure the consent screen requested offline access; for Microsoft, ensure the offline_access scope is granted'
      )
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
  } finally {
    server.close()
  }
}

export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const data = await postTokenRequest(tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })
  if (!data.access_token) {
    throw new Error('Refresh response did not include an access token')
  }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}
