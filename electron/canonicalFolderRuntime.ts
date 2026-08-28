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
