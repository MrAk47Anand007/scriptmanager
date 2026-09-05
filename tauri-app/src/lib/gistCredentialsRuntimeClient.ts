export type GithubGistSettings = { configured: boolean; syncEnabled: boolean }
export type SaveGithubGistSettingsPayload = { token?: string; syncEnabled: boolean }

function requireRuntime() {
  const runtime = window.scriptManagerDesktop?.runtime
  if (!runtime?.readGithubGistSettings || !runtime?.saveGithubGistSettings || !runtime?.clearGithubGistSettings) {
    throw new Error('Desktop runtime unavailable')
  }
  return runtime
}

export async function readGithubGistSettingsRuntime(): Promise<GithubGistSettings> {
  return requireRuntime().readGithubGistSettings()
}

export async function saveGithubGistSettingsRuntime(payload: SaveGithubGistSettingsPayload): Promise<GithubGistSettings> {
  return requireRuntime().saveGithubGistSettings(payload)
}

export async function clearGithubGistSettingsRuntime(): Promise<GithubGistSettings> {
  return requireRuntime().clearGithubGistSettings()
}
