import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__ELECTRON__', true)
contextBridge.exposeInMainWorld('scriptManagerDesktop', {
  selectFolder: () => ipcRenderer.invoke('scriptmanager:select-folder') as Promise<string | null>,
  revealPath: (targetPath: string) => ipcRenderer.invoke('scriptmanager:reveal-path', targetPath) as Promise<boolean>,
  copyText: (value: string) => ipcRenderer.invoke('scriptmanager:copy-text', value) as Promise<boolean>,
  runtime: {
    listScripts: () => ipcRenderer.invoke('scriptmanager:runtime:list-scripts') as Promise<unknown[]>,
    listCollections: () => ipcRenderer.invoke('scriptmanager:runtime:list-collections') as Promise<unknown[]>,
    createCollection: (payload: unknown) => ipcRenderer.invoke('scriptmanager:runtime:create-collection', payload) as Promise<unknown>,
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
    setTerminalContext: (payload: { scriptId: string | null }) => ipcRenderer.invoke('scriptmanager:runtime:set-terminal-context', payload) as Promise<{ ok: boolean }>,
    warmTerminal: () => ipcRenderer.invoke('scriptmanager:runtime:warm-terminal') as Promise<{ ok: boolean }>,
    sendTerminalInput: (data: string) => ipcRenderer.invoke('scriptmanager:runtime:terminal-input', data) as Promise<{ ok: boolean }>,
    resizeTerminal: (cols: number, rows: number) => ipcRenderer.invoke('scriptmanager:runtime:terminal-resize', { cols, rows }) as Promise<{ ok: boolean }>,
    closeTerminal: () => ipcRenderer.invoke('scriptmanager:runtime:terminal-close') as Promise<{ ok: boolean }>,
    runScriptInTerminal: (payload: { scriptId: string; paramValues?: Record<string, string> }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-in-terminal', payload) as Promise<{ ok: boolean }>,
    runScript: (payload: { scriptId: string; paramValues?: Record<string, string>; buildId?: string }) =>
      ipcRenderer.invoke('scriptmanager:runtime:run-script', payload) as Promise<{ buildId: string; status: 'started' | 'failed' }>,
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
  },
})
