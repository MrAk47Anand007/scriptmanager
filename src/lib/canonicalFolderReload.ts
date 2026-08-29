import type { CanonicalFolderChange } from './scriptsRuntimeClient'

export function getCanonicalFolderReloadAction({
  change,
  activeScriptId,
  activeSourcePath,
  editorContent,
  persistedContent,
}: {
  change: CanonicalFolderChange
  activeScriptId: string | null
  activeSourcePath?: string | null
  editorContent: string
  persistedContent: string
}): 'ignore' | 'reload' | 'recover' {
  const matchesActiveScript = change.scriptId === activeScriptId || change.sourcePath === activeSourcePath
  if (!matchesActiveScript) return 'ignore'
  return editorContent === persistedContent ? 'reload' : 'recover'
}
