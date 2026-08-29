const PRIVATE_SETTING_KEYS = new Set(['github_token'])
const MAX_SETTING_COUNT = 100
const MAX_SETTING_VALUE_LENGTH = 64 * 1024
const MAX_SETTING_BYTES = 1_000_000

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

export function parsePublicSettings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Settings payload must be an object')
  }

  const entries = Object.entries(value)
  if (entries.length > MAX_SETTING_COUNT) throw new Error('Too many settings')
  const settings: Record<string, string> = {}
  let totalLength = 0
  for (const [key, settingValue] of entries) {
    assertPublicSettingKey(key)
    if (typeof settingValue !== 'string' || settingValue.length > MAX_SETTING_VALUE_LENGTH || settingValue.includes('\0')) {
      throw new Error(`Setting '${key}' must be a string`)
    }
    totalLength += key.length + settingValue.length
    if (totalLength > MAX_SETTING_BYTES) throw new Error('Settings payload is too large')
    settings[key] = settingValue
  }
  return settings
}
