import fs from 'fs'
import path from 'path'

export type ScannedFile = {
  path: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
}

export type ScanForScriptsOptions = {
  roots: string[]
  extensions: string[]
  maxResults?: number
  maxDepth?: number
}

export type ScanForScriptsResult = {
  files: ScannedFile[]
  truncated: boolean
  scannedDirs: number
}

const DEFAULT_MAX_RESULTS = 2000
const DEFAULT_MAX_DEPTH = 10
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024

// Dependency/system/build folders that never hold user-authored scripts.
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'venv', 'env', '.env', 'envs',
  'site-packages', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', '.tox', '.mypy_cache',
  '.pytest_cache', 'coverage', 'vendor', 'bower_components', '.idea', '.vscode', '.gradle',
  '.m2', 'target', 'obj', 'bin', 'appdata', 'application data', '.npm', '.yarn', '.pnpm-store',
  '.conda', 'anaconda3', 'miniconda3', '.cargo', '.rustup', '.nuget', '.docker', 'onedrivetemp',
  '$recycle.bin', 'system volume information', 'windows', 'program files', 'program files (x86)',
  'programdata', '.trash',
].map((name) => name.toLowerCase()))

function isExcludedDir(name: string): boolean {
  // Hidden directories are skipped wholesale; named exclusions are case-insensitive.
  return name.startsWith('.') || EXCLUDED_DIR_NAMES.has(name.toLowerCase())
}

function isIgnorableFsError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'EBUSY' || code === 'UNKNOWN'
}

export async function scanForScripts(options: ScanForScriptsOptions): Promise<ScanForScriptsResult> {
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const extensions = new Set(options.extensions.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`).toLowerCase()))

  const files: ScannedFile[] = []
  let truncated = false
  let scannedDirs = 0

  const walk = async (dirPath: string, depth: number): Promise<void> => {
    if (truncated || depth > maxDepth) {
      return
    }

    scannedDirs += 1
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    } catch (error) {
      if (isIgnorableFsError(error)) {
        return
      }
      throw error
    }

    for (const entry of entries) {
      if (truncated) {
        return
      }

      // Never follow symlinks or Windows junctions.
      if (entry.isSymbolicLink()) {
        continue
      }

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        if (!isExcludedDir(entry.name)) {
          await walk(fullPath, depth + 1)
        }
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const ext = path.extname(entry.name).toLowerCase()
      if (!extensions.has(ext)) {
        continue
      }
      if (entry.name.startsWith('._') || entry.name.toLowerCase().endsWith('.min.js')) {
        continue
      }

      let stats: fs.Stats
      try {
        stats = await fs.promises.stat(fullPath)
      } catch (error) {
        if (isIgnorableFsError(error)) {
          continue
        }
        throw error
      }

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        continue
      }

      files.push({
        path: fullPath,
        name: entry.name,
        ext,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      })

      if (files.length >= maxResults) {
        truncated = true
        return
      }
    }
  }

  for (const root of options.roots) {
    // The chosen root itself is always scanned, even when its own name would be
    // excluded (e.g. a user picks a dot-folder deliberately).
    await walk(path.resolve(root), 0)
  }

  return { files, truncated, scannedDirs }
}
