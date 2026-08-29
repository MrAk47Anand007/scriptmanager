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
      showNotification?: (payload: { title: string; body: string; deepLink?: string }) => Promise<boolean>
      onNotificationDeepLink?: (listener: (deepLink: string) => void) => () => void
      oauthConnect?: (payload: { provider: 'gdrive' | 'onedrive'; clientId?: string; fullAccess?: boolean }) => Promise<{
        ok: boolean
        refreshToken?: string
        accessToken?: string
        expiresAt?: number
        clientIdUsed?: string
        error?: string
      }>
      oauthDefaults?: () => Promise<{ gdrive: boolean; onedrive: boolean }>
      agents?: {
        discover: () => Promise<unknown[]>
        launch: (payload: { provider: 'codex' | 'claude'; sessionId: string; profileId: string; cwd: string }) => Promise<unknown>
        input: (payload: { sessionId: string; message: unknown }) => Promise<{ ok: boolean }>
        permissionDecision: (payload: { sessionId: string; requestId: string; allowed: boolean }) => Promise<{ ok: boolean }>
        interrupt: (sessionId: string) => Promise<{ ok: boolean }>
        terminate: (sessionId: string) => Promise<{ ok: boolean }>
        onEvent: (listener: (payload: { sessionId: string; event: unknown }) => void) => () => void
      }
      runtime?: {
        getBootstrapState: () => Promise<{ scripts: unknown[]; collections: unknown[]; settings: Record<string, string> }>
        readSettings: () => Promise<Record<string, string>>
        saveSettings: (payload: Record<string, string>) => Promise<Record<string, string>>
        listSecrets: () => Promise<unknown[]>
        createSecret: (payload: { name: string; plaintext: string; description?: string; scope?: string }) => Promise<unknown>
        rotateSecret: (payload: { id: string; plaintext?: string; resource?: string; reason?: string }) => Promise<unknown>
        disableSecret: (payload: { id: string; resource?: string; reason?: string }) => Promise<unknown>
        listApprovals: (status?: string) => Promise<unknown[]>
        decideApproval: (payload: { id: string; decision: string; note?: string }) => Promise<unknown>
        listWorkspaceAccess: () => Promise<unknown>
        createWorkspaceInvitation: (payload: { email: string; roleId: string }) => Promise<unknown>
        revokeWorkspaceGrants: (payload?: { actorId?: string }) => Promise<unknown>
        createWorkspaceRole: (payload: { name: string; permissions: string[]; description?: string }) => Promise<unknown>
        listWorkflows: () => Promise<unknown[]>
        createWorkflow: (payload: unknown) => Promise<unknown>
        saveWorkflow: (payload: unknown) => Promise<unknown>
        publishWorkflow: (id: string) => Promise<unknown>
        runWorkflow: (payload: { id: string; input?: unknown }) => Promise<unknown>
        listWorkflowRuns: (workflowId: string) => Promise<unknown[]>
        readWorkflowRun: (runId: string) => Promise<unknown>
        retryWorkflowNode: (payload: { runId: string; nodeId: string }) => Promise<unknown>
        cancelWorkflowRun: (runId: string) => Promise<unknown>
        listNotificationChannels: () => Promise<unknown[]>
        createNotificationChannel: (payload: { name: string; kind: string; config?: unknown }) => Promise<unknown>
        listPlugins: () => Promise<unknown[]>
        updatePlugin: (payload: { id: string; action: string; healthy?: boolean; message?: string; settings?: unknown }) => Promise<unknown>
        removePlugin: (id: string) => Promise<void>
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
        rescanCanonicalFolder?: (collectionId: string) => Promise<unknown>
        listCanonicalRecoveryDrafts?: (scriptId: string) => Promise<unknown[]>
        saveCanonicalRecoveryDraft?: (payload: { scriptId: string; sourcePath: string; sourceRevision: string; content: string }) => Promise<unknown>
        discardCanonicalRecoveryDraft?: (draftId: string) => Promise<void>
        onCanonicalFolderChange?: (listener: (event: {
          type: 'changed' | 'deleted'
          collectionId: string
          sourcePath: string
          scriptId?: string
        }) => void) => () => void
        scanPcScripts?: (payload: { roots: string[]; extensions: string[] }) => Promise<{
          files: Array<{ path: string; name: string; ext: string; sizeBytes: number; modifiedAt: string }>
          truncated: boolean
          scannedDirs: number
        }>
        importScannedScripts?: (payload: { files: { path: string }[]; mode: 'misc' | 'by-folder'; rootForGrouping?: string }) => Promise<{
          imported: number
          skipped: number
          collections: string[]
        }>
        setTerminalContext: (payload: { sessionId?: string; scriptId: string | null }) => Promise<{ ok: boolean }>
        warmTerminal: (payload?: { sessionId?: string }) => Promise<{ ok: boolean }>
        sendTerminalInput: (payload: { sessionId?: string; data: string }) => Promise<{ ok: boolean }>
        resizeTerminal: (payload: { sessionId?: string; cols: number; rows: number }) => Promise<{ ok: boolean }>
        closeTerminal: (payload?: { sessionId?: string }) => Promise<{ ok: boolean }>
        runScriptInTerminal: (payload: { sessionId?: string; scriptId: string; paramValues?: Record<string, string> }) => Promise<{ ok: boolean }>
        runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) => Promise<{ buildId: string; status: 'started' | 'failed' }>
        cancelRun?: (buildId: string) => Promise<{ ok: boolean }>
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
        approveRemoteExecution: (payload: { id: string; note?: string }) => Promise<{ ok: true; remoteExecId: string }>
        rejectRemoteExecution: (id: string) => Promise<{ ok: true; remoteExecId: string }>
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
