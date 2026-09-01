// Lazy access-token manager for OAuth refresh-token providers (Google Drive,
// OneDrive). Exchanges the stored refresh token for an access token on demand
// and caches it until shortly before expiry. Runs in both web (Node 18+) and
// desktop runtimes — only the initial connect flow is desktop-only.

const EXPIRY_SKEW_MS = 60_000

type TokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export type TokenManager = { getAccessToken(): Promise<string> }

export function createTokenManager(tokenUrl: string, clientId: string, refreshToken: string): TokenManager {
  let cached: { accessToken: string; expiresAt: number } | null = null
  let inflight: Promise<string> | null = null

  async function refresh(): Promise<string> {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
    })
    const data = (await response.json().catch(() => ({}))) as TokenResponse
    if (!response.ok || data.error || !data.access_token) {
      throw new Error(
        `Token refresh failed: ${data.error_description || data.error || `HTTP ${response.status}`}`
      )
    }
    cached = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    }
    return cached.accessToken
  }

  return {
    async getAccessToken(): Promise<string> {
      if (cached && Date.now() < cached.expiresAt - EXPIRY_SKEW_MS) {
        return cached.accessToken
      }
      if (!inflight) {
        inflight = refresh().finally(() => {
          inflight = null
        })
      }
      return inflight
    },
  }
}
