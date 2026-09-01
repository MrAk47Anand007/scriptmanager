export function isDesktopRenderer(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export function isPackagedDesktop(): boolean {
  return isDesktopRenderer() && process.env.NODE_ENV === 'production'
}
