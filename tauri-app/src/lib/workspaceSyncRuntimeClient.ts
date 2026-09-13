import { invokeTauri } from '@/lib/tauriInvoke'

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export type ImportWorkspaceResult = {
  scripts: number
  collections: number
  apiRequests: number
  workflows: number
  skipped: number
  dryRun: boolean
}

export async function exportWorkspaceRuntime(): Promise<unknown> {
  if (isTauri()) return invokeTauri('export_workspace_bundle')
  if (window.scriptManagerDesktop?.runtime?.exportWorkspace) {
    return window.scriptManagerDesktop.runtime.exportWorkspace()
  }
  throw new Error('Desktop runtime unavailable')
}

export async function importWorkspaceRuntime(payload: { bundle: unknown; onConflict: string; dryRun: boolean }): Promise<ImportWorkspaceResult> {
  if (isTauri()) return invokeTauri('import_workspace_bundle', { payload }) as Promise<ImportWorkspaceResult>
  if (window.scriptManagerDesktop?.runtime?.importWorkspace) {
    return window.scriptManagerDesktop.runtime.importWorkspace(payload) as Promise<ImportWorkspaceResult>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function publishWorkspaceToGitRuntime(payload: { repoPath: string; commitMessage: string }): Promise<{ committed: boolean; commitId: string; repoPath: string }> {
  if (isTauri()) return invokeTauri('publish_workspace_to_git', { payload }) as Promise<{ committed: boolean; commitId: string; repoPath: string }>
  if (window.scriptManagerDesktop?.runtime?.publishWorkspaceToGit) {
    return window.scriptManagerDesktop.runtime.publishWorkspaceToGit(payload) as Promise<{ committed: boolean; commitId: string; repoPath: string }>
  }
  throw new Error('Desktop runtime unavailable')
}
