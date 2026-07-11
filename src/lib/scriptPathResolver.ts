import path from 'path'

// Pure script-path resolution shared by the web runtime (src/lib/scriptRunner.ts)
// and the desktop runtime (electron/desktopRuntime.ts) — mirroring how
// workspaceLayout is shared. Resolution precedence:
// 1. explicit sourcePath (linked/external scripts)
// 2. the collection's workspace folder
// 3. the managed scripts root
export type ScriptPathInput = {
  filename: string
  sourcePath?: string | null
  collection?: { folderPath?: string | null } | null
}

export function resolveScriptFilePath(script: ScriptPathInput, scriptsRoot: string): string {
  if (script.sourcePath) {
    return path.resolve(script.sourcePath)
  }
  if (script.collection?.folderPath) {
    return path.resolve(script.collection.folderPath, path.basename(script.filename))
  }
  return path.resolve(scriptsRoot, path.basename(script.filename))
}
