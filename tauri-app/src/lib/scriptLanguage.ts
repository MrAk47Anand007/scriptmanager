import path from 'path'

export function inferScriptLanguage(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.py') return 'python'
  if (extension === '.js' || extension === '.ts') return 'node'
  if (extension === '.ps1') return 'powershell'
  if (extension === '.sh' || extension === '.bat') return 'shell'
  return 'custom'
}

export function defaultScriptExtension(language: string): string {
  switch (language) {
    case 'node': return '.js'
    case 'shell': return '.sh'
    case 'powershell': return '.ps1'
    default: return '.py'
  }
}
