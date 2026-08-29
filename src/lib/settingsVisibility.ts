const PRIVATE_SETTING_KEYS = new Set(['github_token'])

export function filterPublicSettings(settings: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !PRIVATE_SETTING_KEYS.has(key)),
  )
}

export function assertPublicSettingKey(key: string): void {
  if (PRIVATE_SETTING_KEYS.has(key)) {
    throw new Error(`Setting '${key}' must be stored in the secret vault`)
  }
}
