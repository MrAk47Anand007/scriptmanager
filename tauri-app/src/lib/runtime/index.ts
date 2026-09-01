export * from '@/lib/scriptsRuntimeClient'
export * from '@/lib/apiRuntimeClient'
export * from '@/lib/opsRuntimeClient'

/** true when running inside the Electron shell */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__ELECTRON__)
}
