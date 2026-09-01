import fs from 'fs'
import path from 'path'
export { inferScriptLanguage } from './scriptLanguage'

const SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])

export function isSupportedScriptFile(fileName: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export function getFolderDisplayName(folderPath: string): string {
  return path.basename(folderPath) || folderPath
}

function isIgnorableDirectoryError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'EBUSY'
}

export function listScriptFiles(folderPath: string): string[] {
  const results: string[] = []

  const walk = (currentPath: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
    } catch (error) {
      if (isIgnorableDirectoryError(error)) return
      throw error
    }
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isSymbolicLink()) {
        continue
      }
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (entry.isFile() && isSupportedScriptFile(entry.name)) {
        results.push(fullPath)
      }
    }
  }

  walk(folderPath)
  return results.sort((a, b) => a.localeCompare(b))
}

export function buildLinkedScriptName(folderPath: string, filePath: string): string {
  const relativePath = path.relative(folderPath, filePath)
  return relativePath.replace(/\\/g, '/')
}
