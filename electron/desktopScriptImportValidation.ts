import path from 'node:path'

const MAX_IMPORT_FILES = 2_000
const SUPPORTED_SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])

type DesktopScriptImportInput = {
  files?: unknown
  mode?: unknown
  rootForGrouping?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isSupportedDesktopScriptPath(filePath: string): boolean {
  return SUPPORTED_SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export function normalizeDesktopScriptImportPayload(payload: unknown): {
  files: Array<{ path: string }>
  mode: 'misc' | 'by-folder'
  rootForGrouping?: string
} {
  if (!isRecord(payload)) {
    throw new Error('Script import payload is required')
  }

  const input = payload as DesktopScriptImportInput
  if (input.mode !== 'misc' && input.mode !== 'by-folder') {
    throw new Error('Script import mode is invalid')
  }
  if (!Array.isArray(input.files)) {
    throw new Error('Script import files are required')
  }
  if (input.files.length > MAX_IMPORT_FILES) {
    throw new Error(`Too many script files to import (maximum ${MAX_IMPORT_FILES})`)
  }

  const rootForGrouping = typeof input.rootForGrouping === 'string' ? input.rootForGrouping.trim() : undefined
  if (rootForGrouping && (!path.isAbsolute(rootForGrouping) || rootForGrouping.includes('\0'))) {
    throw new Error('Grouping root must be an absolute path')
  }

  const seen = new Set<string>()
  const files: Array<{ path: string }> = []
  for (const item of input.files) {
    if (!isRecord(item) || typeof item.path !== 'string') {
      throw new Error('Each imported file must include a path')
    }
    const rawPath = item.path.trim()
    if (!rawPath) continue
    if (rawPath.includes('\0') || !path.isAbsolute(rawPath)) {
      throw new Error('Imported script paths must be absolute')
    }

    const normalizedPath = path.normalize(rawPath)
    if (!seen.has(normalizedPath)) {
      seen.add(normalizedPath)
      files.push({ path: normalizedPath })
    }
  }

  return {
    files,
    mode: input.mode,
    ...(rootForGrouping ? { rootForGrouping: path.normalize(rootForGrouping) } : {}),
  }
}
