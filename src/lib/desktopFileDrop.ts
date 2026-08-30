export type DesktopDroppedFile = {
  path?: string | null
}

const SUPPORTED_SCRIPT_EXTENSIONS = new Set(['.py', '.js', '.ts', '.sh', '.ps1', '.bat'])

function hasSupportedScriptExtension(filePath: string): boolean {
  const filename = filePath.split(/[\\/]/).pop() ?? filePath
  const dot = filename.lastIndexOf('.')
  return dot >= 0 && SUPPORTED_SCRIPT_EXTENSIONS.has(filename.slice(dot).toLowerCase())
}

export function getDesktopDroppedScriptPaths(files: Iterable<DesktopDroppedFile>): string[] {
  const paths: string[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const filePath = typeof file.path === 'string' ? file.path.trim() : ''
    if (!filePath || !hasSupportedScriptExtension(filePath) || seen.has(filePath)) {
      continue
    }
    seen.add(filePath)
    paths.push(filePath)
  }

  return paths
}
