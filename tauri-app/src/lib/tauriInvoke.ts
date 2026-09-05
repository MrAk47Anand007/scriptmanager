import { invoke } from '@tauri-apps/api/core'
import { getErrorMessage } from '@/lib/unsupportedTauriFeature'

export async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, payload ?? {})
  } catch (error) {
    throw new Error(`Tauri command ${command} failed: ${getErrorMessage(error)}`)
  }
}
