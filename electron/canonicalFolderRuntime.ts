import fs from 'node:fs'

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
