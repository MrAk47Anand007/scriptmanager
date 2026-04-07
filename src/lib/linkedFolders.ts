import fs from 'fs'
import path from 'path'

const SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])

export function isSupportedScriptFile(fileName: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

export function inferScriptLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.py') return 'python'
  if (ext === '.js' || ext === '.ts') return 'node'
  if (ext === '.sh' || ext === '.ps1' || ext === '.bat') return 'shell'
  return 'custom'
}

export function getFolderDisplayName(folderPath: string): string {
  return path.basename(folderPath) || folderPath
}

export function listScriptFiles(folderPath: string): string[] {
  const results: string[] = []

  const walk = (currentPath: string) => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (isSupportedScriptFile(entry.name)) {
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
