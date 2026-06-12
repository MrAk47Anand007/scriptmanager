export {}

declare global {
  type ScriptManagerDesktopTerminalEvent =
    | { sessionId: string; type: 'connected' }
    | { sessionId: string; type: 'data'; data: string }
    | { sessionId: string; type: 'closed' }
    | { sessionId: string; type: 'error'; message: string }

  type ScriptManagerDesktopBuildEvent =
    | { type: 'started'; buildId: string }
    | { type: 'line'; buildId: string; line: string }
    | { type: 'done'; buildId: string; status: 'success' | 'failure' | 'timeout'; exitCode: number }
    | { type: 'error'; buildId: string; message: string }

  type ScriptManagerDesktopRemoteExecEvent =
    | { type: 'line'; remoteExecId: string; line: string }
    | { type: 'done'; remoteExecId: string; exitCode: number }
    | { type: 'error'; remoteExecId: string; message: string }

  interface Window {
    __ELECTRON__?: boolean
    scriptManagerDesktop?: {
      selectFolder: () => Promise<string | null>
      setTitleBarTheme?: (theme: 'light' | 'dark') => Promise<boolean>
      revealPath: (targetPath: string) => Promise<boolean>
      copyText: (value: string) => Promise<boolean>
      readClipboardText: () => Promise<string>
      setNotificationsEnabled?: (enabled: boolean) => Promise<boolean>
      oauthConnect?: (payload: { provider: 'gdrive' | 'onedrive'; clientId?: string; fullAccess?: boolean }) => Promise<{
        ok: boolean
        refreshToken?: string
        accessToken?: string
        expiresAt?: number
        clientIdUsed?: string
        error?: string
      }>
      oauthDefaults?: () => Promise<{ gdrive: boolean; onedrive: boolean }>
      runtime?: {
        listScripts: () => Promise<unknown[]>
        listCollections: () => Promise<unknown[]>
        createCollection: (payload: unknown) => Promise<unknown>
        updateCollection: (payload: unknown) => Promise<unknown>
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
        setTerminalContext: (payload: { sessionId?: string; scriptId: string | null }) => Promise<{ ok: boolean }>
        warmTerminal: (payload?: { sessionId?: string }) => Promise<{ ok: boolean }>
        sendTerminalInput: (payload: { sessionId?: string; data: string }) => Promise<{ ok: boolean }>
        resizeTerminal: (payload: { sessionId?: string; cols: number; rows: number }) => Promise<{ ok: boolean }>
        closeTerminal: (payload?: { sessionId?: string }) => Promise<{ ok: boolean }>
        runScriptInTerminal: (payload: { sessionId?: string; scriptId: string; paramValues?: Record<string, string> }) => Promise<{ ok: boolean }>
        runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) => Promise<{ buildId: string; status: 'started' | 'failed' }>
        listApiCollections: () => Promise<unknown[]>
        saveApiCollection: (payload: unknown) => Promise<unknown>
        deleteApiCollection: (id: string) => Promise<string>
        listApiRequests: (collectionId?: string | null) => Promise<unknown[]>
        saveApiRequest: (payload: unknown) => Promise<unknown>
        deleteApiRequest: (id: string) => Promise<string>
        listApiEnvironments: () => Promise<unknown[]>
        saveApiEnvironment: (payload: unknown) => Promise<unknown>
        deleteApiEnvironment: (id: string) => Promise<string>
        readApiGlobals: () => Promise<unknown>
        saveApiGlobals: (variables: string) => Promise<unknown>
        sendApiRequest: (payload: unknown) => Promise<unknown>
        listApiHistory: () => Promise<unknown[]>
        clearApiHistory: () => Promise<unknown>
        listApiCollectionRuns: () => Promise<unknown[]>
        runApiCollection: (payload: { collectionId: string; environmentId: string | null }) => Promise<unknown>
        listProjects: () => Promise<unknown[]>
        saveProject: (payload: unknown) => Promise<unknown>
        deleteProject: (id: string) => Promise<string>
        assignCollectionToProject: (payload: { collectionId: string; projectId: string | null }) => Promise<unknown>
        listServerProfiles: () => Promise<unknown[]>
        saveServerProfile: (payload: unknown) => Promise<unknown>
        deleteServerProfile: (id: string) => Promise<string>
        testServerProfileConnection: (profileId: string) => Promise<unknown>
        transferRemoteScript: (payload: unknown) => Promise<unknown>
        startRemoteExecution: (payload: unknown) => Promise<unknown>
        approveRemoteExecution: (payload: { id: string; approverName: string }) => Promise<string>
        rejectRemoteExecution: (id: string) => Promise<string>
        listAuditLog: (payload?: unknown) => Promise<unknown>
        listStorageProviders?: () => Promise<unknown[]>
        saveStorageProvider?: (payload: unknown) => Promise<unknown>
        deleteStorageProvider?: (id: string) => Promise<unknown>
        testStorageProvider?: (id: string) => Promise<unknown>
        syncCollection?: (collectionId: string) => Promise<unknown>
        onTerminalEvent: (listener: (event: ScriptManagerDesktopTerminalEvent) => void) => () => void
        onBuildEvent: (listener: (event: ScriptManagerDesktopBuildEvent) => void) => () => void
        onRemoteExecEvent: (listener: (event: ScriptManagerDesktopRemoteExecEvent) => void) => () => void
      }
    }
  }
}
