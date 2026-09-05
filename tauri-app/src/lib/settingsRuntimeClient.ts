export async function readSettingsRuntime(): Promise<Record<string, string>> {
  if (!window.scriptManagerDesktop?.runtime) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.readSettings()
}

export async function saveSettingsRuntime(settings: Record<string, string>): Promise<Record<string, string>> {
  if (!window.scriptManagerDesktop?.runtime?.saveSettings) {
    throw new Error('Desktop runtime unavailable')
  }
  return window.scriptManagerDesktop.runtime.saveSettings(settings)
}
