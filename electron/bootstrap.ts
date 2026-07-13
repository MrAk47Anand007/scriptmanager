import { app } from 'electron'
import { initializeDesktopProcessEnvironment } from './desktopEnvironment'

initializeDesktopProcessEnvironment({
  packaged: app.isPackaged,
  userDataPath: app.getPath('userData'),
  tempPath: app.getPath('temp'),
  cwd: process.cwd(),
})

require('./main')
