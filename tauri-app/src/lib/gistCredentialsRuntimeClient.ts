export type GithubGistSettings = { configured: boolean; syncEnabled: boolean }
export type SaveGithubGistSettingsPayload = { token?: string; syncEnabled: boolean }

export async function readGithubGistSettingsRuntime(): Promise<GithubGistSettings> {
  if (window.scriptManagerDesktop?.runtime?.readGithubGistSettings) {
    return window.scriptManagerDesktop.runtime.readGithubGistSettings()
  }

  const response = await fetch('/api/settings/github-gist')
  if (!response.ok) throw new Error('Failed to read GitHub Gist settings')
  return response.json()
}

export async function saveGithubGistSettingsRuntime(payload: SaveGithubGistSettingsPayload): Promise<GithubGistSettings> {
  if (window.scriptManagerDesktop?.runtime?.saveGithubGistSettings) {
    return window.scriptManagerDesktop.runtime.saveGithubGistSettings(payload)
  }

  const response = await fetch('/api/settings/github-gist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error((await response.json()).error ?? 'Failed to save GitHub Gist settings')
  return response.json()
}

export async function clearGithubGistSettingsRuntime(): Promise<GithubGistSettings> {
  if (window.scriptManagerDesktop?.runtime?.clearGithubGistSettings) {
    return window.scriptManagerDesktop.runtime.clearGithubGistSettings()
  }

  const response = await fetch('/api/settings/github-gist', { method: 'DELETE' })
  if (!response.ok) throw new Error((await response.json()).error ?? 'Failed to clear GitHub Gist settings')
  return response.json()
}
