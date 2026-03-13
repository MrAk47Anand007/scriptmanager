import path from 'path'

const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9_.-]/g

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

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
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
  const normalizedDir = remotePath?.trim() ? remotePath.trim() : '/tmp/'
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
