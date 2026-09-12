export * from '@/lib/scriptsRuntimeClient'
export * from '@/lib/apiRuntimeClient'
export * from '@/lib/opsRuntimeClient'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'
export { isDesktopRenderer, isPackagedDesktop } from '@/lib/runtime/desktopMode'

/** true when running inside the Tauri desktop shell */
export function isDesktop(): boolean {
  return isDesktopRenderer()
}
