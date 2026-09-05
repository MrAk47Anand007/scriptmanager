export class UnsupportedTauriFeatureError extends Error {
  readonly feature: string

  constructor(feature: string) {
    super(`${feature} is not migrated to Tauri yet`)
    this.name = 'UnsupportedTauriFeatureError'
    this.feature = feature
  }
}

export function unsupportedTauriFeature(feature: string): never {
  throw new UnsupportedTauriFeatureError(feature)
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
