import crypto from 'crypto'
import { createClient, type FileStat, type WebDAVClient } from 'webdav'
import type { RemoteFile, StorageProviderClient, WebdavConfig } from './types'

function fallbackEtag(lastmod: string, size: number): string {
  return crypto.createHash('sha256').update(`${lastmod}:${size}`).digest('hex').slice(0, 32)
}

function statEtag(stat: FileStat): string {
  const raw = (stat.etag ?? '').replace(/"/g, '')
  return raw || fallbackEtag(stat.lastmod, stat.size)
}

export function createWebdavProvider(config: WebdavConfig): StorageProviderClient {
  const client: WebDAVClient = createClient(config.baseUrl, {
    username: config.username,
    password: config.password,
  })

  async function ensureDirectory(remotePath: string): Promise<void> {
    const parts = remotePath.split('/').slice(0, -1).filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      if (!(await client.exists(current))) {
        await client.createDirectory(current)
      }
    }
  }

  return {
    async test() {
      const startedAt = Date.now()
      try {
        await client.exists('/')
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
      const dir = prefix.startsWith('/') ? prefix : `/${prefix}`
      if (!(await client.exists(dir))) {
        return []
      }
      const contents = (await client.getDirectoryContents(dir, { deep: true })) as FileStat[]
      return contents
        .filter((item) => item.type === 'file')
        .map((item) => ({
          path: item.filename.replace(/^\//, ''),
          etag: statEtag(item),
          size: item.size,
          modifiedAt: new Date(item.lastmod).toISOString(),
        }))
    },

    async pull(remotePath: string): Promise<Buffer> {
      const content = await client.getFileContents(`/${remotePath.replace(/^\//, '')}`, {
        format: 'binary',
      })
      return Buffer.isBuffer(content) ? content : Buffer.from(content as ArrayBuffer)
    },

    async push(remotePath: string, content: Buffer): Promise<{ etag: string }> {
      const target = `/${remotePath.replace(/^\//, '')}`
      await ensureDirectory(target)
      await client.putFileContents(target, content, { overwrite: true })
      const stat = (await client.stat(target)) as FileStat
      return { etag: statEtag(stat) }
    },

    async remove(remotePath: string): Promise<void> {
      await client.deleteFile(`/${remotePath.replace(/^\//, '')}`)
    },
  }
}
