export {}

declare global {
  type ScriptManagerDesktopTerminalEvent =
    | { type: 'connected' }
    | { type: 'data'; data: string }
    | { type: 'closed' }
    | { type: 'error'; message: string }

  type ScriptManagerDesktopBuildEvent =
    | { type: 'started'; buildId: string }
    | { type: 'line'; buildId: string; line: string }
    | { type: 'done'; buildId: string; status: 'success' | 'failure' | 'timeout'; exitCode: number }
    | { type: 'error'; buildId: string; message: string }

  interface Window {
    __ELECTRON__?: boolean
    scriptManagerDesktop?: {
      selectFolder: () => Promise<string | null>
      revealPath: (targetPath: string) => Promise<boolean>
      copyText: (value: string) => Promise<boolean>
      runtime?: {
        listScripts: () => Promise<unknown[]>
        listCollections: () => Promise<unknown[]>
        createCollection: (payload: unknown) => Promise<unknown>
        deleteCollection: (payload: { id: string; hardDelete?: boolean }) => Promise<unknown>
        inspectFolder: (folderPath: string) => Promise<unknown>
        inspectCollectionWorkspace: (collectionId: string) => Promise<unknown>
        manageCollectionPythonEnv: (payload: { collectionId: string; recreate?: boolean }) => Promise<unknown>
        readScript: (scriptId: string) => Promise<unknown>
        createScript: (payload: unknown) => Promise<unknown>
        saveScript: (payload: unknown) => Promise<unknown>
        deleteScript: (payload: { id: string }) => Promise<string>
        duplicateScript: (scriptId: string) => Promise<unknown>
        openFolder: (payload: unknown) => Promise<unknown>
        setTerminalContext: (payload: { scriptId: string | null }) => Promise<{ ok: boolean }>
        warmTerminal: () => Promise<{ ok: boolean }>
        sendTerminalInput: (data: string) => Promise<{ ok: boolean }>
        resizeTerminal: (cols: number, rows: number) => Promise<{ ok: boolean }>
        closeTerminal: () => Promise<{ ok: boolean }>
        runScriptInTerminal: (payload: { scriptId: string; paramValues?: Record<string, string> }) => Promise<{ ok: boolean }>
        runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) => Promise<{ buildId: string; status: 'started' | 'failed' }>
        onTerminalEvent: (listener: (event: ScriptManagerDesktopTerminalEvent) => void) => () => void
        onBuildEvent: (listener: (event: ScriptManagerDesktopBuildEvent) => void) => () => void
      }
    }
  }
}
