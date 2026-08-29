import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__ELECTRON__', true)
contextBridge.exposeInMainWorld('scriptManagerDesktop', {
  selectFolder: () => ipcRenderer.invoke('scriptmanager:select-folder') as Promise<string | null>,
  setTitleBarTheme: (theme: 'light' | 'dark') => ipcRenderer.invoke('scriptmanager:set-titlebar-theme', theme) as Promise<boolean>,
  revealPath: (targetPath: string) => ipcRenderer.invoke('scriptmanager:reveal-path', targetPath) as Promise<boolean>,
  copyText: (value: string) => ipcRenderer.invoke('scriptmanager:copy-text', value) as Promise<boolean>,
  readClipboardText: () => ipcRenderer.invoke('scriptmanager:read-text') as Promise<string>,
  setNotificationsEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('scriptmanager:set-notifications-enabled', enabled) as Promise<boolean>,
  showNotification: (payload: { title: string; body: string; deepLink?: string }) =>
    ipcRenderer.invoke('scriptmanager:show-notification', payload) as Promise<boolean>,
  onNotificationDeepLink: (listener: (deepLink: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, deepLink: string) => listener(deepLink)
    ipcRenderer.on('scriptmanager:notification-deep-link', handler)
    return () => ipcRenderer.removeListener('scriptmanager:notification-deep-link', handler)
  },
  oauthConnect: (payload: { provider: 'gdrive' | 'onedrive'; clientId?: string; fullAccess?: boolean }) =>
    ipcRenderer.invoke('scriptmanager:oauth-connect', payload) as Promise<{
      ok: boolean
      refreshToken?: string
      accessToken?: string
      expiresAt?: number
      clientIdUsed?: string
      error?: string
    }>,
  oauthDefaults: () =>
    ipcRenderer.invoke('scriptmanager:oauth-defaults') as Promise<{ gdrive: boolean; onedrive: boolean }>,
  agents: {
    discover: () => ipcRenderer.invoke('scriptmanager:agents:discover') as Promise<unknown[]>,
    launch: (payload: { provider: 'codex' | 'claude'; sessionId: string; profileId: string; cwd: string }) => ipcRenderer.invoke('scriptmanager:agents:launch', payload) as Promise<unknown>,
    input: (payload: { sessionId: string; message: unknown }) => ipcRenderer.invoke('scriptmanager:agents:input', payload) as Promise<{ ok: boolean }>,
    permissionDecision: (payload: { sessionId: string; requestId: string; allowed: boolean }) => ipcRenderer.invoke('scriptmanager:agents:permission', payload) as Promise<{ ok: boolean }>,
    interrupt: (sessionId: string) => ipcRenderer.invoke('scriptmanager:agents:interrupt', sessionId) as Promise<{ ok: boolean }>,
    terminate: (sessionId: string) => ipcRenderer.invoke('scriptmanager:agents:terminate', sessionId) as Promise<{ ok: boolean }>,
    onEvent: (listener: (payload: { sessionId: string; event: unknown }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { sessionId: string; event: unknown }) => listener(payload)
      ipcRenderer.on('scriptmanager:agents:event', handler)
      return () => ipcRenderer.removeListener('scriptmanager:agents:event', handler)
    },
  },
  runtime: {
    getBootstrapState: () =>
      ipcRenderer.invoke('scriptmanager:runtime:get-bootstrap-state') as Promise<{ scripts: unknown[]; collections: unknown[]; settings: Record<string, string> }>,
    readSettings: () => ipcRenderer.invoke('scriptmanager:runtime:read-settings') as Promise<Record<string, string>>,
    saveSettings: (payload: Record<string, string>) =>
      ipcRenderer.invoke('scriptmanager:runtime:save-settings', payload) as Promise<Record<string, string>>,
    readGithubGistSettings: () =>
      ipcRenderer.invoke('scriptmanager:runtime:read-github-gist-settings') as Promise<{ configured: boolean; syncEnabled: boolean }>,
    saveGithubGistSettings: (payload: { token?: string; syncEnabled: boolean }) =>
      ipcRenderer.invoke('scriptmanager:runtime:save-github-gist-settings', payload) as Promise<{ configured: boolean; syncEnabled: boolean }>,
    clearGithubGistSettings: () =>
      ipcRenderer.invoke('scriptmanager:runtime:clear-github-gist-settings') as Promise<{ configured: boolean; syncEnabled: boolean }>,
    listSecrets: () => ipcRenderer.invoke('scriptmanager:runtime:list-secrets') as Promise<unknown[]>,
    createSecret: (payload: { name: string; plaintext: string; description?: string; scope?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:create-secret', payload) as Promise<unknown>,
    rotateSecret: (payload: { id: string; plaintext?: string; resource?: string; reason?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:rotate-secret', payload) as Promise<unknown>,
    disableSecret: (payload: { id: string; resource?: string; reason?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:disable-secret', payload) as Promise<unknown>,
    listApprovals: (status = 'pending') =>
      ipcRenderer.invoke('scriptmanager:runtime:list-approvals', status) as Promise<unknown[]>,
    decideApproval: (payload: { id: string; decision: string; note?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:decide-approval', payload) as Promise<unknown>,
    listWorkspaceAccess: () => ipcRenderer.invoke('scriptmanager:runtime:list-workspace-access') as Promise<unknown>,
    createWorkspaceInvitation: (payload: { email: string; roleId: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:create-workspace-invitation', payload) as Promise<unknown>,
    revokeWorkspaceGrants: (payload?: { actorId?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:revoke-workspace-grants', payload ?? {}) as Promise<unknown>,
    createWorkspaceRole: (payload: { name: string; permissions: string[]; description?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:create-workspace-role', payload) as Promise<unknown>,
    listWorkflows: () => ipcRenderer.invoke('scriptmanager:runtime:list-workflows') as Promise<unknown[]>,
    createWorkflow: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:create-workflow', payload) as Promise<unknown>,
    saveWorkflow: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-workflow', payload) as Promise<unknown>,
    publishWorkflow: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:publish-workflow', id) as Promise<unknown>,
    runWorkflow: (payload: { id: string; input?: unknown }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-workflow', payload) as Promise<unknown>,
    listWorkflowRuns: (workflowId: string) =>
      ipcRenderer.invoke('scriptmanager:runtime:list-workflow-runs', workflowId) as Promise<unknown[]>,
    readWorkflowRun: (runId: string) => ipcRenderer.invoke('scriptmanager:runtime:read-workflow-run', runId) as Promise<unknown>,
    retryWorkflowNode: (payload: { runId: string; nodeId: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:retry-workflow-node', payload) as Promise<unknown>,
    cancelWorkflowRun: (runId: string) => ipcRenderer.invoke('scriptmanager:runtime:cancel-workflow-run', runId) as Promise<unknown>,
    listNotificationChannels: () => ipcRenderer.invoke('scriptmanager:runtime:list-notification-channels') as Promise<unknown[]>,
    createNotificationChannel: (payload: { name: string; kind: string; config?: unknown }) =>
      ipcRenderer.invoke('scriptmanager:runtime:create-notification-channel', payload) as Promise<unknown>,
    listPlugins: () => ipcRenderer.invoke('scriptmanager:runtime:list-plugins') as Promise<unknown[]>,
    updatePlugin: (payload: { id: string; action: string; healthy?: boolean; message?: string; settings?: unknown }) =>
      ipcRenderer.invoke('scriptmanager:runtime:update-plugin', payload) as Promise<unknown>,
    removePlugin: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:remove-plugin', id) as Promise<void>,
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
    exportScripts: () => ipcRenderer.invoke('scriptmanager:runtime:export-scripts') as Promise<unknown>,
    exportScript: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:export-script', scriptId) as Promise<unknown>,
    importScripts: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:import-scripts', payload) as Promise<unknown>,
    createScript: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:create-script', payload) as Promise<unknown>,
    saveScript: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-script', payload) as Promise<unknown>,
    syncGist: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:sync-gist', scriptId) as Promise<{ gist_id: string; gist_url: string; gist_filename: string }>,
    deleteGist: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-gist', scriptId) as Promise<{ ok: boolean }>,
    listBuilds: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:list-builds', scriptId) as Promise<unknown[]>,
    readBuildOutput: (payload: { scriptId: string; buildId: string }) => ipcRenderer.invoke('scriptmanager:runtime:read-build-output', payload) as Promise<string>,
    readSchedule: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:read-schedule', scriptId) as Promise<unknown>,
    saveSchedule: (payload: { scriptId: string; cron: string; enabled: boolean }) => ipcRenderer.invoke('scriptmanager:runtime:save-schedule', payload) as Promise<unknown>,
    deleteSchedule: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-schedule', scriptId) as Promise<unknown>,
    listEnv: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:list-env', scriptId) as Promise<unknown[]>,
    saveEnv: (payload: { scriptId: string; key: string; value: string; isSecret: boolean }) => ipcRenderer.invoke('scriptmanager:runtime:save-env', payload) as Promise<unknown>,
    deleteEnv: (payload: { scriptId: string; key: string }) => ipcRenderer.invoke('scriptmanager:runtime:delete-env', payload) as Promise<unknown>,
    listVersions: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:list-versions', scriptId) as Promise<unknown[]>,
    readVersion: (payload: { scriptId: string; versionId: string }) => ipcRenderer.invoke('scriptmanager:runtime:read-version', payload) as Promise<unknown>,
    regenerateWebhook: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:regenerate-webhook', scriptId) as Promise<unknown>,
    regenerateWebhookSecret: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:regenerate-webhook-secret', scriptId) as Promise<unknown>,
    toggleWebhookSignature: (payload: { scriptId: string; requireSignature: boolean }) => ipcRenderer.invoke('scriptmanager:runtime:toggle-webhook-signature', payload) as Promise<unknown>,
    listTags: () => ipcRenderer.invoke('scriptmanager:runtime:list-tags') as Promise<unknown[]>,
    addTag: (payload: { scriptId: string; name: string; color?: string }) => ipcRenderer.invoke('scriptmanager:runtime:add-tag', payload) as Promise<unknown>,
    removeTag: (payload: { scriptId: string; tagId: string }) => ipcRenderer.invoke('scriptmanager:runtime:remove-tag', payload) as Promise<unknown>,
    listTemplates: () => ipcRenderer.invoke('scriptmanager:runtime:list-templates') as Promise<unknown[]>,
    saveTemplate: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-template', payload) as Promise<unknown>,
    moveScript: (payload: { scriptId: string; collectionId: string | null }) =>
      ipcRenderer.invoke('scriptmanager:runtime:move-script', payload) as Promise<unknown>,
    deleteScript: (payload: { id: string }) => ipcRenderer.invoke('scriptmanager:runtime:delete-script', payload) as Promise<string>,
    duplicateScript: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:duplicate-script', scriptId) as Promise<unknown>,
    openFolder: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:open-folder', payload) as Promise<unknown>,
    rescanCanonicalFolder: (collectionId: string) => ipcRenderer.invoke('scriptmanager:runtime:rescan-canonical-folder', collectionId) as Promise<unknown>,
    listCanonicalRecoveryDrafts: (scriptId: string) => ipcRenderer.invoke('scriptmanager:runtime:list-canonical-recovery-drafts', scriptId) as Promise<unknown[]>,
    saveCanonicalRecoveryDraft: (payload: { scriptId: string; sourcePath: string; sourceRevision: string; content: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:save-canonical-recovery-draft', payload) as Promise<unknown>,
    discardCanonicalRecoveryDraft: (draftId: string) => ipcRenderer.invoke('scriptmanager:runtime:discard-canonical-recovery-draft', draftId) as Promise<void>,
    onCanonicalFolderChange: (listener: (event: {
      type: 'changed' | 'deleted'
      collectionId: string
      sourcePath: string
      scriptId?: string
    }) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: {
        type: 'changed' | 'deleted'
        collectionId: string
        sourcePath: string
        scriptId?: string
      }) => listener(payload)
      ipcRenderer.on('scriptmanager:runtime:canonical-folder-change', wrapped)
      return () => ipcRenderer.removeListener('scriptmanager:runtime:canonical-folder-change', wrapped)
    },
    scanPcScripts: (payload: { roots: string[]; extensions: string[] }) =>
      ipcRenderer.invoke('scriptmanager:runtime:scan-pc-scripts', payload) as Promise<unknown>,
    importScannedScripts: (payload: { files: { path: string }[]; mode: 'misc' | 'by-folder'; rootForGrouping?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:import-scanned-scripts', payload) as Promise<unknown>,
    setTerminalContext: (payload: { sessionId?: string; scriptId: string | null }) => ipcRenderer.invoke('scriptmanager:runtime:set-terminal-context', payload) as Promise<{ ok: boolean }>,
    warmTerminal: (payload?: { sessionId?: string }) => ipcRenderer.invoke('scriptmanager:runtime:warm-terminal', payload ?? {}) as Promise<{ ok: boolean }>,
    sendTerminalInput: (payload: { sessionId?: string; data: string }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-input', payload) as Promise<{ ok: boolean }>,
    resizeTerminal: (payload: { sessionId?: string; cols: number; rows: number }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-resize', payload) as Promise<{ ok: boolean }>,
    closeTerminal: (payload?: { sessionId?: string }) => ipcRenderer.invoke('scriptmanager:runtime:terminal-close', payload ?? {}) as Promise<{ ok: boolean }>,
    runScriptInTerminal: (payload: { sessionId?: string; scriptId: string; paramValues?: Record<string, string> }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-in-terminal', payload) as Promise<{ ok: boolean }>,
    runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-script', payload) as Promise<{ buildId: string; status: 'started' | 'failed' }>,
    cancelRun: (buildId: string) => ipcRenderer.invoke('scriptmanager:runtime:cancel-run', buildId) as Promise<{ ok: boolean }>,
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
    approveRemoteExecution: (payload: { id: string; note?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:approve-remote-execution', payload) as Promise<{ ok: true; remoteExecId: string }>,
    rejectRemoteExecution: (id: string) =>
      ipcRenderer.invoke('scriptmanager:runtime:reject-remote-execution', id) as Promise<{ ok: true; remoteExecId: string }>,
    listAuditLog: (payload?: unknown) => ipcRenderer.invoke('scriptmanager:runtime:list-audit-log', payload ?? null) as Promise<unknown>,
    listStorageProviders: () => ipcRenderer.invoke('scriptmanager:runtime:list-storage-providers') as Promise<unknown[]>,
    saveStorageProvider: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:save-storage-provider', payload) as Promise<unknown>,
    deleteStorageProvider: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:delete-storage-provider', id) as Promise<unknown>,
    testStorageProvider: (id: string) => ipcRenderer.invoke('scriptmanager:runtime:test-storage-provider', id) as Promise<unknown>,
    syncCollection: (collectionId: string) => ipcRenderer.invoke('scriptmanager:runtime:sync-collection', collectionId) as Promise<unknown>,
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
