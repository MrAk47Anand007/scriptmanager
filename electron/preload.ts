import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('__ELECTRON__', true)
