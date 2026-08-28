export async function readSettingsRuntime(): Promise<Record<string, string>> {
  if (window.scriptManagerDesktop?.runtime?.readSettings) {
    return window.scriptManagerDesktop.runtime.readSettings() as Promise<Record<string, string>>
  }

  const response = await fetch('/api/settings')
  if (!response.ok) {
    throw new Error('Failed to fetch settings')
  }
  return response.json() as Promise<Record<string, string>>
}

export async function saveSettingsRuntime(settings: Record<string, string>): Promise<Record<string, string>> {
  if (window.scriptManagerDesktop?.runtime?.saveSettings) {
    return window.scriptManagerDesktop.runtime.saveSettings(settings) as Promise<Record<string, string>>
  }

  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    throw new Error('Failed to save settings')
  }
  return settings
}
