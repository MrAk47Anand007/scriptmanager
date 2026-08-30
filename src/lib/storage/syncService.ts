import fs from 'fs'
import path from 'path'
import type { PrismaClient } from '@prisma/client'
import { createProviderClient } from './index'
import { getDecryptedStorageProvider } from './providerStore'
import type { RemoteFile, StorageProviderClient } from './types'
import { resolveScriptFilePath } from '../scriptPathResolver'
import { inferScriptLanguage } from '../scriptLanguage'
import { atomicWriteLocalFile, getConflictCopyPath } from './localFile'
import { withStorageRetry } from './retry'
import type { SecretVaultService } from '../secrets/service'

// Cloud sync engine: pull-on-run, push-on-save, and manual per-collection sync.
// All functions take the PrismaClient as the first argument (web passes the
// singleton from '@/lib/db'; the desktop runtime has its own client) plus the
// resolved scripts root so path resolution matches the host runtime.

export type EnsureFreshResult = {
  ok: boolean
  pulled?: boolean
  stale?: boolean
  missingRemote?: boolean
  warning?: string
}

export type PushScriptResult = {
  ok: boolean
  pushed?: boolean
  skipped?: boolean
  error?: string
}

export type CollectionSyncSummary = {
  ok: boolean
  pulled: number
  pushed: number
  conflicts: number
  skipped: string[]
  error?: string
}

const SYNCABLE_EXTENSIONS = new Set(['.py', '.js', '.sh', '.ps1'])

function normalizeRemotePrefix(prefix: string | null | undefined): string {
  return (prefix ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
}

function buildRemotePath(prefix: string | null | undefined, filename: string): string {
  const normalizedPrefix = normalizeRemotePrefix(prefix)
  const name = path.basename(filename)
  return normalizedPrefix ? `${normalizedPrefix}/${name}` : name
}

type BoundCollection = {
  id: string
  workspaceId: string
  folderPath: string | null
  storageProviderId: string | null
  remotePrefix: string | null
}

async function createClientForCollection(
  prisma: PrismaClient,
  collection: BoundCollection,
  vault?: SecretVaultService
): Promise<StorageProviderClient | null> {
  if (!collection.storageProviderId) return null
  const provider = await getDecryptedStorageProvider(prisma, collection.storageProviderId, vault, collection.workspaceId)
  if (!provider) return null
  return createProviderClient(provider.type, provider.config)
}

function findRemoteFile(files: RemoteFile[], prefix: string | null | undefined, filename: string): RemoteFile | undefined {
  const target = buildRemotePath(prefix, filename).toLowerCase()
  return files.find((file) => file.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase() === target)
}

function localMtimeMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return null
  }
}

async function markSynced(prisma: PrismaClient, scriptId: string, etag: string): Promise<void> {
  await prisma.script.update({
    where: { id: scriptId },
    data: { remoteEtag: etag, remoteSyncedAt: new Date() },
  })
}

/**
 * Pull-on-run: ensure the local copy of a cloud-bound script is fresh before
 * executing it. Never blocks a run — a remote failure degrades to running the
 * cached local copy with a warning.
 */
export async function ensureFreshScript(
  prisma: PrismaClient,
  scriptId: string,
  scriptsRoot: string,
  workspaceId: string,
  vault?: SecretVaultService
): Promise<EnsureFreshResult> {
  try {
    const script = await prisma.script.findFirst({
      where: { id: scriptId, workspaceId },
      include: { collection: true },
    })
    if (!script?.collection?.storageProviderId) {
      return { ok: true }
    }

    const collection = script.collection
    const client = await createClientForCollection(prisma, collection, vault)
    if (!client) {
      return { ok: true, stale: true, warning: 'remote unreachable — running cached copy (storage provider missing)' }
    }

    const localPath = resolveScriptFilePath(script, scriptsRoot)

    let remoteFiles: RemoteFile[]
    try {
      remoteFiles = await withStorageRetry(() => client.list(normalizeRemotePrefix(collection.remotePrefix)))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[CloudSync] ensureFreshScript: remote list failed for script ${scriptId}: ${message}`)
      return { ok: true, stale: true, warning: 'remote unreachable — running cached copy' }
    }

    const remoteFile = findRemoteFile(remoteFiles, collection.remotePrefix, script.filename)
    if (!remoteFile) {
      return { ok: true, missingRemote: true }
    }

    const localExists = fs.existsSync(localPath)
    if (localExists && script.remoteEtag && remoteFile.etag === script.remoteEtag) {
      return { ok: true }
    }

    try {
      const content = await withStorageRetry(() => client.pull(remoteFile.path))
      atomicWriteLocalFile(localPath, content)
      await markSynced(prisma, script.id, remoteFile.etag)
      return { ok: true, pulled: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[CloudSync] ensureFreshScript: pull failed for script ${scriptId}: ${message}`)
      if (localExists) {
        return { ok: true, stale: true, warning: 'remote unreachable — running cached copy' }
      }
      return { ok: true, stale: true, warning: `remote pull failed and no cached copy exists: ${message}` }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[CloudSync] ensureFreshScript failed for script ${scriptId}: ${message}`)
    return { ok: true, stale: true, warning: 'cloud sync error — running local copy' }
  }
}

/**
 * Push-on-save: push the local copy of a cloud-bound script to the remote.
 * Fire-and-forget friendly: never throws.
 */
export async function pushScript(
  prisma: PrismaClient,
  scriptId: string,
  scriptsRoot: string,
  workspaceId: string,
  vault?: SecretVaultService
): Promise<PushScriptResult> {
  try {
    const script = await prisma.script.findFirst({
      where: { id: scriptId, workspaceId },
      include: { collection: true },
    })
    if (!script) {
      return { ok: false, error: 'Script not found' }
    }
    if (!script.collection?.storageProviderId) {
      return { ok: true, skipped: true }
    }

    const client = await createClientForCollection(prisma, script.collection, vault)
    if (!client) {
      return { ok: false, error: 'Storage provider not found' }
    }

    const localPath = resolveScriptFilePath(script, scriptsRoot)
    if (!fs.existsSync(localPath)) {
      return { ok: false, error: `Local file not found: ${localPath}` }
    }

    const content = fs.readFileSync(localPath)
    const remotePath = buildRemotePath(script.collection.remotePrefix, script.filename)
    const { etag } = await withStorageRetry(() => client.push(remotePath, content))
    await markSynced(prisma, script.id, etag)
    return { ok: true, pushed: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[CloudSync] pushScript failed for script ${scriptId}: ${message}`)
    return { ok: false, error: message }
  }
}

function randomWebhookToken(): string {
  // crypto.randomUUID is available in Node 16+ in both runtimes.
  return globalThis.crypto.randomUUID().replace(/-/g, '')
}

/**
 * Manual "Sync now": pull remote files that are newer/different, push local
 * scripts missing remotely, and create Script rows for new remote files with
 * known script extensions. Conflicts (local edited after last sync AND remote
 * changed) keep the remote version but save the local copy as a
 * `.conflict-<timestamp>` sibling. Never throws.
 */
export async function syncCollection(
  prisma: PrismaClient,
  collectionId: string,
  scriptsRoot: string,
  workspaceId: string,
  vault?: SecretVaultService
): Promise<CollectionSyncSummary> {
  const summary: CollectionSyncSummary = { ok: true, pulled: 0, pushed: 0, conflicts: 0, skipped: [] }
  try {
    const collection = await prisma.collection.findFirst({
      where: { id: collectionId, workspaceId },
      include: { scripts: true },
    })
    if (!collection) {
      return { ...summary, ok: false, error: 'Collection not found' }
    }
    if (!collection.storageProviderId) {
      return { ...summary, ok: false, error: 'Collection is not bound to a storage provider' }
    }

    const client = await createClientForCollection(prisma, collection, vault)
    if (!client) {
      return { ...summary, ok: false, error: 'Storage provider not found' }
    }

    const prefix = normalizeRemotePrefix(collection.remotePrefix)
    let remoteFiles: RemoteFile[]
    try {
      remoteFiles = await withStorageRetry(() => client.list(prefix))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...summary, ok: false, error: `Remote unreachable: ${message}` }
    }

    const matchedRemotePaths = new Set<string>()

    for (const script of collection.scripts) {
      const localPath = resolveScriptFilePath({ ...script, collection }, scriptsRoot)
      const remoteFile = findRemoteFile(remoteFiles, prefix, script.filename)
      const remotePath = buildRemotePath(prefix, script.filename)
      const localMtime = localMtimeMs(localPath)

      try {
        if (!remoteFile) {
          // Missing remotely → push the local copy if it exists.
          if (localMtime === null) {
            summary.skipped.push(`${script.filename} (missing locally and remotely)`)
            continue
          }
          const { etag } = await withStorageRetry(() => client.push(remotePath, fs.readFileSync(localPath)))
          await markSynced(prisma, script.id, etag)
          summary.pushed += 1
          continue
        }

        matchedRemotePaths.add(remoteFile.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase())

        const remoteChanged = !script.remoteEtag || remoteFile.etag !== script.remoteEtag
        // A never-synced script with an existing local file counts as locally
        // edited — otherwise the first sync after binding would silently
        // overwrite local work with the remote copy (no conflict sibling).
        const locallyEdited = localMtime !== null
          && (script.remoteSyncedAt === null || localMtime > script.remoteSyncedAt.getTime())

        if (localMtime === null) {
          // No local copy → pull.
          atomicWriteLocalFile(localPath, await withStorageRetry(() => client.pull(remoteFile.path)))
          await markSynced(prisma, script.id, remoteFile.etag)
          summary.pulled += 1
        } else if (remoteChanged && locallyEdited) {
          // Both sides changed → remote wins, local preserved as a conflict copy.
          fs.copyFileSync(localPath, getConflictCopyPath(localPath))
          atomicWriteLocalFile(localPath, await withStorageRetry(() => client.pull(remoteFile.path)))
          await markSynced(prisma, script.id, remoteFile.etag)
          summary.conflicts += 1
          summary.pulled += 1
        } else if (remoteChanged) {
          atomicWriteLocalFile(localPath, await withStorageRetry(() => client.pull(remoteFile.path)))
          await markSynced(prisma, script.id, remoteFile.etag)
          summary.pulled += 1
        } else if (locallyEdited || script.remoteSyncedAt === null) {
          // Remote unchanged but the local copy is newer (or never synced) → push.
          const { etag } = await withStorageRetry(() => client.push(remotePath, fs.readFileSync(localPath)))
          await markSynced(prisma, script.id, etag)
          summary.pushed += 1
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summary.skipped.push(`${script.filename} (${message})`)
      }
    }

    // Remote files without a Script row: create rows for top-level files with
    // known script extensions; report everything else as skipped.
    for (const remoteFile of remoteFiles) {
      const normalizedPath = remoteFile.path.replace(/\\/g, '/').replace(/^\/+/, '')
      if (matchedRemotePaths.has(normalizedPath.toLowerCase())) continue

      const relative = prefix && normalizedPath.toLowerCase().startsWith(`${prefix.toLowerCase()}/`)
        ? normalizedPath.slice(prefix.length + 1)
        : normalizedPath
      if (!relative || relative.includes('/')) {
        summary.skipped.push(`${normalizedPath} (nested path)`)
        continue
      }
      if (/\.conflict-\d+\./.test(relative)) {
        continue
      }
      const ext = path.extname(relative).toLowerCase()
      if (!SYNCABLE_EXTENSIONS.has(ext)) {
        summary.skipped.push(`${normalizedPath} (unsupported extension)`)
        continue
      }
      // Filename collision with a script in another collection sharing the same
      // managed root would overwrite it — skip those.
      const filenameTaken = await prisma.script.findFirst({ where: { filename: relative, workspaceId } })
      if (filenameTaken) {
        summary.skipped.push(`${normalizedPath} (filename already in use)`)
        continue
      }

      try {
        const content = await withStorageRetry(() => client.pull(remoteFile.path))
        const localPath = resolveScriptFilePath({ filename: relative, collection }, scriptsRoot)
        atomicWriteLocalFile(localPath, content)

        const baseName = relative.slice(0, relative.length - ext.length)
        let name = baseName
        let counter = 2
        while (await prisma.script.findFirst({ where: { name, workspaceId } })) {
          name = `${baseName} ${counter++}`
        }

        await prisma.script.create({
          data: {
            name,
            filename: relative,
            language: inferScriptLanguage(relative),
            parameters: '[]',
            workspaceId: collection.workspaceId,
            webhookToken: randomWebhookToken(),
            collectionId: collection.id,
            remoteEtag: remoteFile.etag,
            remoteSyncedAt: new Date(),
          },
        })
        summary.pulled += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summary.skipped.push(`${normalizedPath} (${message})`)
      }
    }

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[CloudSync] syncCollection failed for collection ${collectionId}: ${message}`)
    return { ...summary, ok: false, error: message }
  }
}
