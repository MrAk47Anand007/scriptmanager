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

export async function assertCanonicalFolderAvailable(folderPath: string, collectionId: string): Promise<CanonicalFolderAvailability> {
  const availability = await getCanonicalFolderAvailability(folderPath, collectionId)
  if (!availability.available) {
    throw new Error(`Canonical folder is unavailable${availability.reason ? `: ${availability.reason}` : ''}`)
  }
  return availability
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

function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isIgnorableWatcherError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'EACCES' || code === 'EPERM'
}

async function validateCanonicalFilePath(rootPath: string, sourcePath: string, allowMissing: boolean): Promise<string> {
  const resolvedPath = assertPathWithinRoot(rootPath, sourcePath)
  const realRootPath = await fs.promises.realpath(path.resolve(rootPath))
  const realParentPath = await fs.promises.realpath(path.dirname(resolvedPath))
  if (!isPathWithinRoot(realRootPath, realParentPath)) {
    throw new Error('Canonical file path is outside its canonical folder')
  }

  let stats: fs.Stats
  try {
    stats = await fs.promises.lstat(resolvedPath)
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolvedPath
    }
    throw error
  }

  if (stats.isSymbolicLink()) {
    throw new Error('Canonical file cannot be a symlink')
  }
  if (!stats.isFile()) {
    throw new Error('Canonical source is not a file')
  }

  const realFilePath = await fs.promises.realpath(resolvedPath)
  if (!isPathWithinRoot(realRootPath, realFilePath)) {
    throw new Error('Canonical file path is outside its canonical folder')
  }
  return resolvedPath
}

export async function assertCanonicalFilePath(rootPath: string, sourcePath: string): Promise<string> {
  return validateCanonicalFilePath(rootPath, sourcePath, false)
}

export async function readCanonicalFile(rootPath: string, sourcePath: string): Promise<CanonicalFile> {
  const resolvedPath = await assertCanonicalFilePath(rootPath, sourcePath)
  const handle = await fs.promises.open(resolvedPath, 'r')
  try {
    const [content, stats] = await Promise.all([handle.readFile('utf8'), handle.stat()])
    return { content, revision: revisionFor(stats), sourcePath: resolvedPath }
  } finally {
    await handle.close()
  }
}

export async function writeCanonicalFile(rootPath: string, sourcePath: string, content: string): Promise<CanonicalFile> {
  const resolvedPath = await validateCanonicalFilePath(rootPath, sourcePath, true)
  const temporaryPath = path.join(path.dirname(resolvedPath), `.${path.basename(resolvedPath)}.${crypto.randomUUID()}.tmp`)

  try {
    const handle = await fs.promises.open(temporaryPath, 'wx', 0o600)
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
      if (!isIgnorableWatcherError(error)) throw error
    }
  }

  const watchDirectoryTree = (collectionId: string, rootPath: string, directoryPath: string) => {
    watchDirectory(collectionId, rootPath, directoryPath)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true })
    } catch (error) {
      if (isIgnorableWatcherError(error)) return
      throw error
    }
    for (const entry of entries) {
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
