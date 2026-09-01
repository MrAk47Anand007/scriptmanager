import { app } from 'electron'
import path from 'node:path'
import Module from 'node:module'
import { initializeDesktopProcessEnvironment } from './desktopEnvironment'

// Register runtime path alias resolution for compiled @/ imports in dist-electron
const originalResolveFilename = (Module as any)._resolveFilename
const distSrcRoot = path.resolve(__dirname, '..', 'src')

;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request.startsWith('@/')) {
    const relative = request.slice(2)
    const target = path.join(distSrcRoot, relative)
    return originalResolveFilename.call(this, target, parent, isMain, options)
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

initializeDesktopProcessEnvironment({
  packaged: app.isPackaged,
  userDataPath: app.getPath('userData'),
  tempPath: app.getPath('temp'),
  cwd: process.cwd(),
})

require('./main')
