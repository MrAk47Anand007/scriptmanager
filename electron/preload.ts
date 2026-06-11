import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__ELECTRON__', true)
contextBridge.exposeInMainWorld('scriptManagerDesktop', {
  selectFolder: () => ipcRenderer.invoke('scriptmanager:select-folder') as Promise<string | null>,
  setTitleBarTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke('scriptmanager:set-titlebar-theme', theme) as Promise<boolean>,
  revealPath: (targetPath: string) => ipcRenderer.invoke('scriptmanager:reveal-path', targetPath) as Promise<boolean>,
  copyText: (value: string) => ipcRenderer.invoke('scriptmanager:copy-text', value) as Promise<boolean>,
  readClipboardText: () => ipcRenderer.invoke('scriptmanager:read-text') as Promise<string>,
  runtime: {
    listScripts: () => ipcRenderer.invoke('scriptmanager:runtime:list-scripts') as Promise<unknown[]>,
    listCollections: () => ipcRenderer.invoke('scriptmanager:runtime:list-collections') as Promise<unknown[]>,
    createCollection: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:create-collection', payload) as Promise<unknown>,
    updateCollection: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:update-collection', payload) as Promise<unknown>,
    deleteCollection: (payload: { id: string; hardDelete?: boolean }) =>
      ipcRenderer.invoke('scriptmanager:runtime:delete-collection', payload) as Promise<unknown>,
    inspectFolder: (folderPath: string) => ipcRenderer.invoke('scriptmanager:runtime:inspect-folder', folderPath) as Promise<unknown>,
    inspectCollectionWorkspace: (collectionId: string) => ipcRenderer.invoke('scriptmanager:runtime:inspect-collection-workspace', collectionId) as Promise<unknown>,
    manageCollectionPythonEnv: (payload: { collectionId: string; recreate?: boolean }) =>
      ipcRenderer.invoke('scriptmanager:runtime:manage-collection-python-env', payload) as Promise<unknown>,
    readScript: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:read-script', scriptId) as Promise<unknown>,
    createScript: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:create-script', payload) as Promise<unknown>,
    saveScript: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-script', payload) as Promise<unknown>,
    deleteScript: (payload: { id: string }) => ipcRenderer.invoke('scriptmanager:runtime:delete-script', payload) as Promise<string>,
    duplicateScript: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:duplicate-script', scriptId) as Promise<unknown>,
    openFolder: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:open-folder', payload) as Promise<unknown>,
    setTerminalContext: (payload: { sessionId?: string; scriptId: string | null }) => ipcRenderer.invoke('scriptmanager:runtime:set-terminal-context', payload) as Promise<{ ok: boolean }>,
    warmTerminal: (payload?: { sessionId?: string }) => ipcRenderer.invoke('scriptmanager:runtime:warm-terminal', payload ?? {}) as Promise<{ ok: boolean }>,
    sendTerminalInput: (payload: { sessionId?: string; data: string }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-input', payload) as Promise<{ ok: boolean }>,
    resizeTerminal: (payload: { sessionId?: string; cols: number; rows: number }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-resize', payload) as Promise<{ ok: boolean }>,
    closeTerminal: (payload?: { sessionId?: string }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-close', payload ?? {}) as Promise<{ ok: boolean }>,
    runScriptInTerminal: (payload: { sessionId?: string; scriptId: string; paramValues?: Record<string, string> }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-in-terminal', payload) as Promise<{ ok: boolean }>,
    runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-script', payload) as Promise<{ buildId: string; status: 'started' | 'failed' }>,
    listApiCollections: () => ipcRenderer.invoke('scriptmanager:runtime:list-api-collections') as Promise<unknown[]>,
    saveApiCollection: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-api-collection', payload) as Promise<unknown>,
    deleteApiCollection: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-api-collection', id) as Promise<string>,
    listApiRequests: (collectionId?: string | null) => ipcRenderer.invoke('scriptmanager:runtime:list-api-requests', collectionId ?? null) as Promise<unknown[]>,
    saveApiRequest: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-api-request', payload) as Promise<unknown>,
    deleteApiRequest: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-api-request', id) as Promise<string>,
    listApiEnvironments: () => ipcRenderer.invoke('scriptmanager:runtime:list-api-environments') as Promise<unknown[]>,
    saveApiEnvironment: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-api-environment', payload) as Promise<unknown>,
    deleteApiEnvironment: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-api-environment', id) as Promise<string>,
    readApiGlobals: () => ipcRenderer.invoke('scriptmanager:runtime:read-api-globals') as Promise<unknown>,
    saveApiGlobals: (variables: string) => ipcRenderer.invoke('scriptmanager:runtime:save-api-globals', variables) as Promise<unknown>,
    sendApiRequest: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:send-api-request', payload) as Promise<unknown>,
    listApiHistory: () => ipcRenderer.invoke('scriptmanager:runtime:list-api-history') as Promise<unknown[]>,
    clearApiHistory: () => ipcRenderer.invoke('scriptmanager:runtime:clear-api-history') as Promise<unknown>,
    listApiCollectionRuns: () => ipcRenderer.invoke('scriptmanager:runtime:list-api-collection-runs') as Promise<unknown[]>,
    runApiCollection: (payload: { collectionId: string; environmentId: string | null }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-api-collection', payload) as Promise<unknown>,
    listProjects: () => ipcRenderer.invoke('scriptmanager:runtime:list-projects') as Promise<unknown[]>,
    saveProject: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-project', payload) as Promise<unknown>,
    deleteProject: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-project', id) as Promise<string>,
    assignCollectionToProject: (payload: { collectionId: string; projectId: string | null }) =>
      ipcRenderer.invoke('scriptmanager:runtime:assign-collection-project', payload) as Promise<unknown>,
    listServerProfiles: () => ipcRenderer.invoke('scriptmanager:runtime:list-server-profiles') as Promise<unknown[]>,
    saveServerProfile: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-server-profile', payload) as Promise<unknown>,
    deleteServerProfile: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-server-profile', id) as Promise<string>,
    testServerProfileConnection: (profileId: string) =>
      ipcRenderer.invoke('scriptmanager:runtime:test-server-profile-connection', profileId) as Promise<unknown>,
    transferRemoteScript: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:transfer-remote-script', payload) as Promise<unknown>,
    startRemoteExecution: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:start-remote-execution', payload) as Promise<unknown>,
    approveRemoteExecution: (payload: { id: string; approverName: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:approve-remote-execution', payload) as Promise<string>,
    rejectRemoteExecution: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:reject-remote-execution', id) as Promise<string>,
    listAuditLog: (payload?: unknown) => ipcRenderer.invoke('scriptmanager:runtime:list-audit-log', payload ?? null) as Promise<unknown>,
    onTerminalEvent: (listener: (event: unknown) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => listener(payload)
      ipcRenderer.on('scriptmanager:runtime:terminal', wrapped)
      return () => ipcRenderer.removeListener('scriptmanager:runtime:terminal', wrapped)
    },
    onBuildEvent: (listener: (event: unknown) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => listener(payload)
      ipcRenderer.on('scriptmanager:runtime:build', wrapped)
      return () => ipcRenderer.removeListener('scriptmanager:runtime:build', wrapped)
    },
    onRemoteExecEvent: (listener: (event: unknown) => void) => {
      const wrapped = (_event: unknown, payload: unknown) => listener(payload)
      ipcRenderer.on('scriptmanager:runtime:remote-exec', wrapped)
      return () => ipcRenderer.removeListener('scriptmanager:runtime:remote-exec', wrapped)
    },
  },
})
