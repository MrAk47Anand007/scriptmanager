export function isDesktopRenderer(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__ELECTRON__)
}

export function isPackagedDesktop(): boolean {
  return isDesktopRenderer() && process.env.NODE_ENV === 'production'
}
