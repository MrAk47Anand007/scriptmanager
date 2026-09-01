import { createTokenManager } from './oauthToken'
import type { GdriveConfig, RemoteFile, StorageProviderClient } from './types'

// Google Drive provider via raw drive/v3 REST. Drive has no real paths — we
// expose remote paths as `${prefix}/${name}` (matching how syncService builds
// them) and keep a name→fileId map populated by list(); pull/push/remove
// resolve through that map, listing lazily if the map is cold.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

type DriveFile = {
  id: string
  name: string
  md5Checksum?: string
  size?: string
  modifiedTime?: string
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

export function createGdriveProvider(config: GdriveConfig): StorageProviderClient {
  const tokens = createTokenManager(TOKEN_URL, config.clientId, config.refreshToken)
  const folderId = config.folderId?.trim() || 'root'
  // name (lowercased) → file id, refreshed on every list()
  const idByName = new Map<string, string>()
  let mapWarm = false

  async function authFetch(url: string, init?: RequestInit): Promise<Response> {
    const accessToken = await tokens.getAccessToken()
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: `Bearer ${accessToken}` },
    })
  }

  async function listFolder(): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken,files(id,name,md5Checksum,size,modifiedTime)',
        pageSize: '1000',
        ...(pageToken ? { pageToken } : {}),
      })
      const response = await authFetch(`${API}/files?${params}`)
      if (!response.ok) {
        throw new Error(`Google Drive list failed: ${await readError(response)}`)
      }
      const data = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string }
      files.push(...(data.files ?? []))
      pageToken = data.nextPageToken
    } while (pageToken)

    idByName.clear()
    for (const file of files) {
      idByName.set(file.name.toLowerCase(), file.id)
    }
    mapWarm = true
    return files
  }

  async function resolveFileId(remotePath: string): Promise<string | null> {
    const name = nameFromPath(remotePath).toLowerCase()
    if (!mapWarm || !idByName.has(name)) {
      await listFolder()
    }
    return idByName.get(name) ?? null
  }

  return {
    async test() {
      const startedAt = Date.now()
      try {
        const response = await authFetch(`${API}/about?fields=user`)
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
      const files = await listFolder()
      return files.map((file) => ({
        path: buildPath(prefix, file.name),
        etag: file.md5Checksum || file.modifiedTime || '',
        size: Number(file.size ?? 0),
        modifiedAt: file.modifiedTime ?? new Date(0).toISOString(),
      }))
    },

    async pull(remotePath: string): Promise<Buffer> {
      const fileId = await resolveFileId(remotePath)
      if (!fileId) {
        throw new Error(`Google Drive file not found: ${remotePath}`)
      }
      const response = await authFetch(`${API}/files/${fileId}?alt=media`)
      if (!response.ok) {
        throw new Error(`Google Drive download failed: ${await readError(response)}`)
      }
      return Buffer.from(await response.arrayBuffer())
    },

    async push(remotePath: string, content: Buffer): Promise<{ etag: string }> {
      const name = nameFromPath(remotePath)
      const existingId = await resolveFileId(remotePath)

      let response: Response
      if (existingId) {
        response = await authFetch(
          `${UPLOAD_API}/files/${existingId}?uploadType=media&fields=id,name,md5Checksum,modifiedTime`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: new Uint8Array(content),
          }
        )
      } else {
        const boundary = `sm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
        const metadata = JSON.stringify({ name, parents: [folderId] })
        const body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
          ),
          content,
          Buffer.from(`\r\n--${boundary}--`),
        ])
        response = await authFetch(
          `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime`,
          {
            method: 'POST',
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body: new Uint8Array(body),
          }
        )
      }

      if (!response.ok) {
        throw new Error(`Google Drive upload failed: ${await readError(response)}`)
      }
      const data = (await response.json()) as DriveFile
      idByName.set(data.name.toLowerCase(), data.id)
      return { etag: data.md5Checksum || data.modifiedTime || '' }
    },

    async remove(remotePath: string): Promise<void> {
      const fileId = await resolveFileId(remotePath)
      if (!fileId) return
      const response = await authFetch(`${API}/files/${fileId}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Google Drive delete failed: ${await readError(response)}`)
      }
      idByName.delete(nameFromPath(remotePath).toLowerCase())
    },
  }
}
