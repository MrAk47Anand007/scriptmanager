import { createTokenManager } from './oauthToken'
import type { OnedriveConfig, RemoteFile, StorageProviderClient } from './types'

// OneDrive provider via Microsoft Graph. Files live under
// /me/drive/root:/<folderPath> and remote paths are exposed as
// `${prefix}/${name}` to match how syncService builds them.

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const GRAPH = 'https://graph.microsoft.com/v1.0'

type DriveItem = {
  name: string
  eTag?: string
  size?: number
  lastModifiedDateTime?: string
  file?: unknown
  folder?: unknown
}

function buildPath(prefix: string, name: string): string {
  const normalized = prefix.replace(/^\/+|\/+$/g, '')
  return normalized ? `${normalized}/${name}` : name
}

function nameFromPath(remotePath: string): string {
  const normalized = remotePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } }
    return data.error?.message || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export function createOnedriveProvider(config: OnedriveConfig): StorageProviderClient {
  const tokens = createTokenManager(TOKEN_URL, config.clientId, config.refreshToken)
  const folderPath = (config.folderPath ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

  // Graph item URL for a file name inside the configured folder.
  function itemUrl(name: string, suffix: string): string {
    const fullPath = folderPath ? `${folderPath}/${name}` : name
    const encoded = fullPath.split('/').map(encodeURIComponent).join('/')
    return `${GRAPH}/me/drive/root:/${encoded}${suffix}`
  }

  function childrenUrl(): string {
    if (!folderPath) return `${GRAPH}/me/drive/root/children`
    const encoded = folderPath.split('/').map(encodeURIComponent).join('/')
    return `${GRAPH}/me/drive/root:/${encoded}:/children`
  }

  async function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const accessToken = await tokens.getAccessToken()
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: `Bearer ${accessToken}` },
    })
  }

  return {
    async test() {
      const startedAt = Date.now()
      try {
        const response = await authFetch(`${GRAPH}/me/drive`)
        if (!response.ok) {
          return { ok: false, error: await readError(response), latencyMs: Date.now() - startedAt }
        }
        return { ok: true, latencyMs: Date.now() - startedAt }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startedAt,
        }
      }
    },

    async list(prefix: string): Promise<RemoteFile[]> {
      const files: RemoteFile[] = []
      let url: string | undefined =
        `${childrenUrl()}?$select=name,eTag,size,lastModifiedDateTime,file,folder&$top=200`
      while (url) {
        const response = await authFetch(url)
        if (response.status === 404) {
          // Folder doesn't exist yet — treat as empty; push creates it implicitly.
          return []
        }
        if (!response.ok) {
          throw new Error(`OneDrive list failed: ${await readError(response)}`)
        }
        const data = (await response.json()) as { value?: DriveItem[]; '@odata.nextLink'?: string }
        for (const item of data.value ?? []) {
          if (item.folder) continue
          files.push({
            path: buildPath(prefix, item.name),
            etag: item.eTag ?? item.lastModifiedDateTime ?? '',
            size: item.size ?? 0,
            modifiedAt: item.lastModifiedDateTime ?? new Date(0).toISOString(),
          })
        }
        url = data['@odata.nextLink']
      }
      return files
    },

    async pull(remotePath: string): Promise<Buffer> {
      const response = await authFetch(itemUrl(nameFromPath(remotePath), ':/content'))
      if (!response.ok) {
        throw new Error(`OneDrive download failed: ${await readError(response)}`)
      }
      return Buffer.from(await response.arrayBuffer())
    },

    async push(remotePath: string, content: Buffer): Promise<{ etag: string }> {
      // Simple upload — scripts are well under the 4MB simple-upload limit.
      const response = await authFetch(itemUrl(nameFromPath(remotePath), ':/content'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(content),
      })
      if (!response.ok) {
        throw new Error(`OneDrive upload failed: ${await readError(response)}`)
      }
      const data = (await response.json()) as DriveItem
      return { etag: data.eTag ?? data.lastModifiedDateTime ?? '' }
    },

    async remove(remotePath: string): Promise<void> {
      const response = await authFetch(itemUrl(nameFromPath(remotePath), ''), { method: 'DELETE' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`OneDrive delete failed: ${await readError(response)}`)
      }
    },
  }
}
