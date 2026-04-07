import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('__ELECTRON__', true)
contextBridge.exposeInMainWorld('scriptManagerDesktop', {
  selectFolder: () => ipcRenderer.invoke('scriptmanager:select-folder') as Promise<string | null>,
  revealPath: (targetPath: string) => ipcRenderer.invoke('scriptmanager:reveal-path', targetPath) as Promise<boolean>,
  copyText: (value: string) => ipcRenderer.invoke('scriptmanager:copy-text', value) as Promise<boolean>,
})
