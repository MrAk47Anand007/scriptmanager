export const LEGACY_API_GLOBALS_KEY = 'api_global_variables'

export function apiGlobalsSettingKey(workspaceId: string): string {
  return `${LEGACY_API_GLOBALS_KEY}:${workspaceId}`
}
