import fs from 'fs'
import path from 'path'

export type DesktopWorkspaceLayout = {
  root: string
  scriptsRoot: string
  apiRoot: string
  apiCollectionsRoot: string
  apiSharedRoot: string
  apiUnfiledRoot: string
}

const SAFE_SEGMENT_CHARS = /[^a-zA-Z0-9_.-]/g

export function resolveWorkspaceRoot(configuredPath?: string | null) {
  const raw = configuredPath?.trim() || path.join(process.cwd(), 'user_scripts')
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw)
}

export function getDesktopWorkspaceLayout(configuredPath?: string | null): DesktopWorkspaceLayout {
  const root = resolveWorkspaceRoot(configuredPath)
  const scriptsRoot = path.join(root, 'Scripts')
  const apiRoot = path.join(root, 'APIs')
  return {
    root,
    scriptsRoot,
    apiRoot,
    apiCollectionsRoot: apiRoot,
    apiSharedRoot: path.join(apiRoot, '.scriptmanager'),
    apiUnfiledRoot: path.join(apiRoot, 'Unfiled'),
  }
}

export function ensureDesktopWorkspaceLayout(layout: DesktopWorkspaceLayout) {
  fs.mkdirSync(layout.root, { recursive: true })
  migrateLegacyScriptStorage(layout)
  fs.mkdirSync(layout.scriptsRoot, { recursive: true })
  fs.mkdirSync(layout.apiRoot, { recursive: true })
  fs.mkdirSync(layout.apiSharedRoot, { recursive: true })
  fs.mkdirSync(path.join(layout.apiUnfiledRoot, 'requests'), { recursive: true })
}

function migrateLegacyScriptStorage(layout: DesktopWorkspaceLayout) {
  if (!fs.existsSync(layout.root)) return
  if (fs.existsSync(layout.scriptsRoot) || fs.existsSync(layout.apiRoot)) return

  const entries = fs.readdirSync(layout.root, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'Scripts' && entry.name !== 'APIs')

  if (entries.length === 0) return

  fs.mkdirSync(layout.scriptsRoot, { recursive: true })

  for (const entry of entries) {
    const source = path.join(layout.root, entry.name)
    const target = path.join(layout.scriptsRoot, entry.name)
    if (fs.existsSync(target)) continue
    fs.renameSync(source, target)
  }
}

export function sanitizeWorkspaceName(name: string, fallback = 'item') {
  const sanitized = name
    .trim()
    .replace(SAFE_SEGMENT_CHARS, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.]+|[_\.]+$/g, '')
  return sanitized || fallback
}

export function getApiCollectionFolderName(name: string, id: string) {
  return `${sanitizeWorkspaceName(name, 'collection')}__${id}`
}

export function getApiRequestFileName(name: string, id: string) {
  return `${sanitizeWorkspaceName(name, 'request')}__${id}.json`
}

export function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

export function clearDirectoryContents(dirPath: string, excludeNames: string[] = []) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    return
  }

  for (const entry of fs.readdirSync(dirPath)) {
    if (excludeNames.includes(entry)) {
      continue
    }
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true })
  }
}
