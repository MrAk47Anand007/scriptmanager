export {}

declare global {
  interface Window {
    __ELECTRON__?: boolean
    scriptManagerDesktop?: {
      selectFolder: () => Promise<string | null>
      revealPath: (targetPath: string) => Promise<boolean>
      copyText: (value: string) => Promise<boolean>
    }
  }
}
