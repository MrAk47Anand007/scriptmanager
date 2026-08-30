import type { CanonicalFolderChange } from './scriptsRuntimeClient'

type CanonicalFolderReloadInput = {
  change: CanonicalFolderChange
  activeScriptId: string | null
  activeSourcePath?: string | null
  editorContent: string
  persistedContent: string
}

export function getCanonicalFolderChangeEffect(input: CanonicalFolderReloadInput): {
  refreshWorkspace: boolean
  reload: 'ignore' | 'reload' | 'recover'
} {
  return {
    // Non-active creates, deletes, and renames still change the script tree.
    refreshWorkspace: Boolean(input.change.collectionId.trim() && input.change.sourcePath.trim()),
    reload: getCanonicalFolderReloadAction(input),
  }
}

export function getCanonicalFolderReloadAction({
  change,
  activeScriptId,
  activeSourcePath,
  editorContent,
  persistedContent,
}: CanonicalFolderReloadInput): 'ignore' | 'reload' | 'recover' {
  const matchesActiveScript = change.scriptId === activeScriptId || change.sourcePath === activeSourcePath
  if (!matchesActiveScript) return 'ignore'
  return editorContent === persistedContent ? 'reload' : 'recover'
}
