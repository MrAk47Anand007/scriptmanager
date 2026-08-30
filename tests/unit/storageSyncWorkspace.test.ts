import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { storageClient, createdScripts } = vi.hoisted(() => ({
  storageClient: {
    list: vi.fn(async () => [{ path: 'new-script.py', etag: 'remote-etag', size: 12, modifiedAt: new Date().toISOString() }]),
    pull: vi.fn(async () => Buffer.from('print("remote")', 'utf8')),
  },
  createdScripts: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/storage/providerStore', () => ({
  getDecryptedStorageProvider: vi.fn(async () => ({ id: 'provider-1', name: 'Remote', type: 's3', config: {} })),
}))
vi.mock('@/lib/storage/index', () => ({
  createProviderClient: vi.fn(() => storageClient),
}))

import { syncCollection } from '@/lib/storage/syncService'

let tempRoot = ''

afterEach(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true })
  tempRoot = ''
  createdScripts.length = 0
  storageClient.list.mockClear()
  storageClient.pull.mockClear()
})

describe('cloud sync workspace ownership', () => {
  it('creates discovered scripts in the collection workspace', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scriptmanager-sync-'))
    const database = {
      collection: {
        findFirst: vi.fn(async () => ({
          id: 'foreign-collection',
          workspaceId: 'workspace-b',
          folderPath: null,
          storageProviderId: 'provider-1',
          remotePrefix: null,
          scripts: [],
        })),
      },
      script: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdScripts.push(data)
          return data
        }),
      },
    } as never

    await expect(syncCollection(database, 'foreign-collection', tempRoot, 'workspace-b')).resolves.toMatchObject({ ok: true, pulled: 1 })
    expect(createdScripts).toHaveLength(1)
    expect(createdScripts[0]).toMatchObject({ workspaceId: 'workspace-b', collectionId: 'foreign-collection' })
  })

  it('discovers TypeScript and batch scripts supported by the desktop runtime', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scriptmanager-sync-'))
    storageClient.list.mockResolvedValueOnce([
      { path: 'new-script.ts', etag: 'typescript-etag', size: 12, modifiedAt: new Date().toISOString() },
      { path: 'new-script.bat', etag: 'batch-etag', size: 12, modifiedAt: new Date().toISOString() },
    ])
    const database = {
      collection: {
        findFirst: vi.fn(async () => ({
          id: 'collection-1',
          workspaceId: 'workspace-1',
          folderPath: null,
          storageProviderId: 'provider-1',
          remotePrefix: null,
          scripts: [],
        })),
      },
      script: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdScripts.push(data)
          return data
        }),
      },
    } as never

    await expect(syncCollection(database, 'collection-1', tempRoot, 'workspace-1')).resolves.toMatchObject({ ok: true, pulled: 2 })
    expect(createdScripts.map((script) => script.filename)).toEqual(['new-script.ts', 'new-script.bat'])
  })

  it('does not sync a collection outside the requested workspace', async () => {
    const findFirst = vi.fn(async () => null)
    const database = {
      collection: { findFirst },
      script: { findFirst: vi.fn() },
    } as never

    await expect(syncCollection(database, 'foreign-collection', tempRoot, 'workspace-a')).resolves.toMatchObject({
      ok: false,
      error: 'Collection not found',
    })
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-collection', workspaceId: 'workspace-a' },
      include: { scripts: true },
    })
  })
})
