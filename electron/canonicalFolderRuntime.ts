import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type CanonicalFolderAvailability = {
  collectionId: string
  available: boolean
  checkedAt: string
  reason?: 'missing' | 'not_directory' | 'permission_denied'
}

export async function getCanonicalFolderAvailability(folderPath: string, collectionId: string): Promise<CanonicalFolderAvailability> {
  try {
    const stats = await fs.promises.stat(folderPath)
    return {
      collectionId,
      available: stats.isDirectory(),
      checkedAt: new Date().toISOString(),
      ...(stats.isDirectory() ? {} : { reason: 'not_directory' as const }),
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      collectionId,
      available: false,
      checkedAt: new Date().toISOString(),
      reason: code === 'EACCES' || code === 'EPERM' ? 'permission_denied' : 'missing',
    }
  }
}

export type CanonicalFile = {
  content: string
  revision: string
  sourcePath: string
}

export type CanonicalFolderChange = {
  type: 'changed' | 'deleted'
  collectionId: string
  sourcePath: string
}

export function assertPathWithinRoot(rootPath: string, candidatePath: string): string {
  const root = path.resolve(rootPath)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Script path is outside its canonical folder')
  }
  return candidate
}

function revisionFor(stats: fs.Stats): string {
  return `${stats.mtimeMs}:${stats.size}`
}

export async function readCanonicalFile(rootPath: string, sourcePath: string): Promise<CanonicalFile> {
  const resolvedPath = assertPathWithinRoot(rootPath, sourcePath)
  const [content, stats] = await Promise.all([
    fs.promises.readFile(resolvedPath, 'utf8'),
    fs.promises.stat(resolvedPath),
  ])
  return { content, revision: revisionFor(stats), sourcePath: resolvedPath }
}

export async function writeCanonicalFile(rootPath: string, sourcePath: string, content: string): Promise<CanonicalFile> {
  const resolvedPath = assertPathWithinRoot(rootPath, sourcePath)
  const temporaryPath = path.join(path.dirname(resolvedPath), `.${path.basename(resolvedPath)}.${crypto.randomUUID()}.tmp`)

  try {
    const handle = await fs.promises.open(temporaryPath, 'w', 0o600)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.promises.rename(temporaryPath, resolvedPath)
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }

  return readCanonicalFile(rootPath, resolvedPath)
}

export function createCanonicalFolderWatcher({
  onChange,
  debounceMs = 50,
}: {
  onChange: (event: CanonicalFolderChange) => void
  debounceMs?: number
}) {
  const watchers = new Map<string, Map<string, fs.FSWatcher>>()
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  const emit = async (collectionId: string, folderPath: string, filename: string) => {
    const sourcePath = path.resolve(folderPath, filename)
    if (path.basename(sourcePath).includes('.tmp')) return

    try {
      const stats = await fs.promises.stat(sourcePath)
      if (stats.isFile()) onChange({ type: 'changed', collectionId, sourcePath })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        onChange({ type: 'deleted', collectionId, sourcePath })
      }
    }
  }

  const watchDirectory = (collectionId: string, rootPath: string, directoryPath: string) => {
    const collectionWatchers = watchers.get(collectionId)
    if (!collectionWatchers || collectionWatchers.has(directoryPath)) return

    try {
      const watcher = fs.watch(directoryPath, (_eventType, changedName) => {
        if (!changedName) return
        const changedPath = path.resolve(directoryPath, changedName.toString())
        const key = `${collectionId}:${changedPath}`
        const existing = pending.get(key)
        if (existing) clearTimeout(existing)
        pending.set(key, setTimeout(() => {
          pending.delete(key)
          void fs.promises.stat(changedPath).then((stats) => {
            if (stats.isDirectory()) {
              watchDirectoryTree(collectionId, rootPath, changedPath)
              void emitExistingFiles(collectionId, rootPath, changedPath)
            }
          }).catch(() => undefined)
          void emit(collectionId, rootPath, path.relative(rootPath, changedPath))
        }, debounceMs))
      })
      collectionWatchers.set(directoryPath, watcher)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  const watchDirectoryTree = (collectionId: string, rootPath: string, directoryPath: string) => {
    watchDirectory(collectionId, rootPath, directoryPath)
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      if (entry.isDirectory()) watchDirectoryTree(collectionId, rootPath, path.join(directoryPath, entry.name))
    }
  }

  const emitExistingFiles = async (collectionId: string, rootPath: string, directoryPath: string) => {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        await emitExistingFiles(collectionId, rootPath, entryPath)
      } else if (entry.isFile()) {
        await emit(collectionId, rootPath, path.relative(rootPath, entryPath))
      }
    }
  }

  return {
    watch(collectionId: string, folderPath: string) {
      this.unwatch(collectionId)
      const rootPath = path.resolve(folderPath)
      watchers.set(collectionId, new Map())
      watchDirectoryTree(collectionId, rootPath, rootPath)
    },

    unwatch(collectionId: string) {
      for (const watcher of watchers.get(collectionId)?.values() ?? []) watcher.close()
      watchers.delete(collectionId)
    },

    close() {
      for (const timeout of pending.values()) clearTimeout(timeout)
      pending.clear()
      for (const collectionWatchers of watchers.values()) {
        for (const watcher of collectionWatchers.values()) watcher.close()
      }
      watchers.clear()
    },
  }
}
