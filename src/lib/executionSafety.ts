import path from 'path'

const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9_.-]/g
const REMOTE_PATH_CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const MAX_REMOTE_PATH_LENGTH = 4096
const FILE_PERMISSION_MODE = /^[0-7]{3,4}$/

export function sanitizeScriptFilename(name: string, fallbackExtension = '.py'): string {
  const trimmed = name.trim()
  const ext = path.extname(trimmed) || fallbackExtension
  const baseName = path.basename(trimmed, ext).replace(SAFE_FILENAME_CHARS, '_').replace(/_+/g, '_').replace(/^[_\.]+|[_\.]+$/g, '')
  const safeBaseName = baseName || 'script'
  const safeExtension = ext.replace(/[^a-zA-Z0-9.]/g, '') || fallbackExtension
  return `${safeBaseName}${safeExtension.startsWith('.') ? safeExtension : `.${safeExtension}`}`
}

export function assertSafeStoredFilename(filename: string): string {
  const basename = path.basename(filename)
  if (basename !== filename || basename.includes('..')) {
    throw new Error('Unsafe script filename')
  }
  return basename
}

export function assertSafeBuildId(buildId: string): string {
  if (typeof buildId !== 'string' || buildId.length === 0 || buildId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(buildId)) {
    throw new Error('Unsafe build ID')
  }
  return buildId
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export function normalizeRemotePath(value: unknown, fallback = '/tmp/'): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') throw new Error('Remote path is invalid')
  if (REMOTE_PATH_CONTROL_CHARS.test(value)) throw new Error('Remote path is invalid')

  const normalized = value.trim()
  if (!normalized) return fallback
  if (normalized.length > MAX_REMOTE_PATH_LENGTH) throw new Error('Remote path is invalid')
  return normalized
}

export function normalizeFilePermissions(value: unknown, fallback = '755'): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !FILE_PERMISSION_MODE.test(value)) {
    throw new Error('File permissions are invalid')
  }
  return value
}

export function buildRemoteChmodCommand(remoteFilePath: string, permissions?: unknown): string {
  const normalizedPath = normalizeRemotePath(remoteFilePath, '')
  if (!normalizedPath) throw new Error('Remote file path is invalid')
  return `chmod ${normalizeFilePermissions(permissions)} ${shellEscape(normalizedPath)}`
}

function powerShellEscape(value: string): string {
  return `'${value.replace(/'/g, `''`)}'`
}

export function buildRemoteCommand(
  filename: string,
  remotePath?: string,
  paramValues?: Record<string, string>
): string {
  const safeFilename = assertSafeStoredFilename(filename)
  const normalizedDir = normalizeRemotePath(remotePath)
  const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`
  const scriptPath = `${dirWithSlash}${safeFilename}`

  const envPrefix = paramValues
    ? Object.entries(paramValues)
      .map(([key, value]) => `${key.replace(/[^a-zA-Z0-9_]/g, '_')}=${shellEscape(String(value))}`)
      .join(' ') + ' '
    : ''

  const escapedScriptPath = shellEscape(scriptPath)

  if (safeFilename.endsWith('.py')) return `${envPrefix}python3 ${escapedScriptPath}`
  if (safeFilename.endsWith('.js')) return `${envPrefix}node ${escapedScriptPath}`
  if (safeFilename.endsWith('.sh')) return `${envPrefix}bash ${escapedScriptPath}`
  return `${envPrefix}bash ${escapedScriptPath}`
}

export function buildLocalTerminalCommand(opts: {
  filePath: string
  language: string
  interpreter?: string | null
  paramValues?: Record<string, string>
}): string {
  const { filePath, language, interpreter, paramValues } = opts
  const isWindows = process.platform === 'win32'

  let command: string
  let args: string[]

  switch (language) {
    case 'python':
      command = isWindows ? 'python' : 'python3'
      args = ['-u', filePath]
      break
    case 'node':
      command = 'node'
      args = [filePath]
      break
    case 'shell':
      if (isWindows) {
        command = 'cmd'
        args = ['/c', filePath]
      } else {
        command = 'bash'
        args = [filePath]
      }
      break
    case 'custom':
      command = interpreter ?? (isWindows ? 'python' : 'python3')
      args = [filePath]
      break
    default:
      command = isWindows ? 'python' : 'python3'
      args = ['-u', filePath]
      break
  }

  if (isWindows) {
    const envStatements = paramValues
      ? Object.entries(paramValues)
        .map(([key, value]) => `$env:${key.replace(/[^a-zA-Z0-9_]/g, '_')}=${powerShellEscape(String(value))}`)
        .join('; ')
      : ''

    const invocation = `& ${powerShellEscape(command)} ${args.map(powerShellEscape).join(' ')}`
    return envStatements ? `${envStatements}; ${invocation}` : invocation
  }

  const envPrefix = paramValues
    ? Object.entries(paramValues)
      .map(([key, value]) => `${key.replace(/[^a-zA-Z0-9_]/g, '_')}=${shellEscape(String(value))}`)
      .join(' ') + ' '
    : ''

  return `${envPrefix}${shellEscape(command)} ${args.map(shellEscape).join(' ')}`
}
