import { app, BrowserWindow, session, ipcMain, dialog, OpenDialogOptions, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import fs from 'fs'
import { attachDesktopRuntime, initDesktopRuntimeIpc, warmWindowDesktopRuntime } from './desktopRuntime'

// In dev mode, `concurrently` already runs the Next.js server on port 3000.
// In production (packaged), Electron spawns the standalone server itself.
const IS_DEV = !app.isPackaged
const DEV_PORT = parseInt(process.env.DEV_PORT ?? '3000', 10)
const PROD_PORT = parseInt(process.env.ELECTRON_PORT ?? '3141', 10)
const PORT = IS_DEV ? DEV_PORT : PROD_PORT

// In dev, DESKTOP_AUTH_SECRET is set by the npm script so both processes share it.
// In production, generate a fresh ephemeral secret per launch.
const DESKTOP_SECRET = process.env.DESKTOP_AUTH_SECRET ?? crypto.randomBytes(32).toString('hex')
let serverProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

type WindowState = {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1400,
  height: 900,
}

function ensureDesktopProcessEnv() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = app.isPackaged
      ? `file:${path.join(app.getPath('userData'), 'scriptmanager.db')}`
      : 'file:./data/scriptmanager.db'
  }

  if (!process.env.SCRIPTS_DIR) {
    process.env.SCRIPTS_DIR = app.isPackaged
      ? path.join(app.getPath('userData'), 'user_scripts')
      : path.join(process.cwd(), 'user_scripts')
  }

  if (!process.env.BUILDS_DIR) {
    process.env.BUILDS_DIR = app.isPackaged
      ? path.join(app.getPath('userData'), 'builds')
      : path.join(app.getPath('temp'), 'ScriptManager', 'builds')
  }
}

function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readWindowState(): WindowState {
  try {
    const contents = fs.readFileSync(getWindowStatePath(), 'utf8')
    const parsed = JSON.parse(contents) as Partial<WindowState>
    return {
      width: parsed.width && parsed.width >= 900 ? parsed.width : DEFAULT_WINDOW_STATE.width,
      height: parsed.height && parsed.height >= 600 ? parsed.height : DEFAULT_WINDOW_STATE.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      isMaximized: parsed.isMaximized === true,
    }
  } catch {
    return DEFAULT_WINDOW_STATE
  }
}

function saveWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) {
    return
  }

  const bounds = window.getBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: window.isMaximized(),
  }

  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    console.warn('[Electron] Failed to save window state:', error)
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 560,
    height: 340,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: true,
    backgroundColor: '#0b1020',
    alwaysOnTop: true,
    webPreferences: {
      sandbox: false,
    },
  })

  const splashHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>ScriptManager</title>
        <style>
          :root { color-scheme: dark; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
              radial-gradient(circle at 18% 12%, rgba(56, 189, 248, 0.22), transparent 36%),
              radial-gradient(circle at 82% 20%, rgba(37, 99, 235, 0.18), transparent 32%),
              linear-gradient(180deg, #09101c 0%, #060912 100%);
            color: #e8eef9;
            font-family: "Segoe UI", system-ui, sans-serif;
          }
          .shell {
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
            padding: 22px;
            box-sizing: border-box;
          }
          .panel {
            width: min(100%, 496px);
            min-height: 252px;
            border-radius: 24px;
            padding: 28px;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            background:
              linear-gradient(180deg, rgba(28, 40, 72, 0.92) 0%, rgba(11, 18, 33, 0.96) 100%);
            border: 1px solid rgba(116, 141, 189, 0.28);
            box-shadow:
              0 24px 70px rgba(0, 0, 0, 0.38),
              inset 0 1px 0 rgba(255, 255, 255, 0.04);
          }
          .panel::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
              radial-gradient(circle at top, rgba(96, 165, 250, 0.18), transparent 38%),
              linear-gradient(135deg, rgba(59, 130, 246, 0.08), transparent 54%);
            pointer-events: none;
          }
          .inner {
            position: relative;
            z-index: 1;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 18px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.04em;
          }
          .mark {
            width: 40px;
            height: 40px;
            border-radius: 13px;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #3b82f6, #0ea5e9);
            color: white;
            font-weight: 800;
            box-shadow: 0 12px 30px rgba(37, 99, 235, 0.34);
          }
          .copy {
            max-width: 360px;
          }
          .eyebrow {
            color: #7dd3fc;
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .subtle {
            color: #acc0e0;
            font-size: 15px;
            line-height: 1.55;
          }
          .meter {
            display: grid;
            gap: 9px;
          }
          .meter-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            color: #90a4c6;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .bar {
            height: 7px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(43, 57, 86, 0.92);
          }
          .bar::after {
            content: "";
            display: block;
            width: 34%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #3b82f6, #38bdf8 55%, #67e8f9);
            box-shadow: 0 0 24px rgba(56, 189, 248, 0.45);
            animation: pulse 1.1s ease-in-out infinite alternate;
          }
          @keyframes pulse {
            from { transform: translateX(0); }
            to { transform: translateX(185%); }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="panel">
            <div class="inner">
              <div class="copy">
                <div class="eyebrow">Desktop Workspace</div>
                <div class="brand">
                  <div class="mark">&lt;/&gt;</div>
                  <div>ScriptManager</div>
                </div>
                <div class="subtle">Starting the local workspace and preparing your tools for a faster desktop run.</div>
              </div>
              <div class="meter">
                <div class="meter-row">
                  <span>Booting Runtime</span>
                  <span>Please wait</span>
                </div>
                <div class="bar"></div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(splashHtml)}`)
  splashWindow.once('closed', () => {
    splashWindow = null
  })
}

function createApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void BrowserWindow.getFocusedWindow()?.webContents.executeJavaScript(
              'window.dispatchEvent(new CustomEvent("scriptmanager:desktop-open-folder"))'
            )
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [{ role: 'front' as const }] : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function startServer() {
  if (IS_DEV) {
    // Dev: server is already running via `concurrently`, nothing to spawn
    return
  }

  // Production: spawn the compiled standalone server
  const nodeExe = process.platform === 'win32' ? 'node.exe' : 'node'
  const nodePath = path.join(path.dirname(process.execPath), nodeExe)
  const serverScript = path.join(process.resourcesPath, 'app', 'server.js')

  serverProcess = spawn(nodePath, [serverScript], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DESKTOP_AUTH_SECRET: DESKTOP_SECRET,
      DATABASE_URL: `file:${path.join(app.getPath('userData'), 'scriptmanager.db')}`,
      SCRIPTS_DIR: path.join(app.getPath('userData'), 'user_scripts'),
      BUILDS_DIR: path.join(app.getPath('userData'), 'builds'),
    },
    stdio: 'pipe',
  })

  serverProcess.stdout?.on('data', (d: Buffer) => console.log('[Server]', d.toString().trimEnd()))
  serverProcess.stderr?.on('data', (d: Buffer) => console.error('[Server]', d.toString().trimEnd()))
  serverProcess.on('exit', (code) => console.log('[Server] exited with code', code))
}

function waitForServer(url: string, retries = 60): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve()
          } else {
            retry()
          }
        })
        .on('error', retry)
    }
    const retry = () => {
      if (++attempts >= retries) {
        reject(new Error('Server did not start in time'))
        return
      }
      setTimeout(check, 1000)
    }
    check()
  })
}

async function createWindow() {
  ensureDesktopProcessEnv()
  const windowState = readWindowState()

  if (!splashWindow) {
    createSplashWindow()
  }

  startServer()

  try {
    await waitForServer(`http://localhost:${PORT}/api/auth/login`)
  } catch (err) {
    console.error('Failed to start server:', err)
    app.quit()
    return
  }

  // Inject session cookie so middleware skips password auth for this Electron session
  await session.defaultSession.cookies.set({
    url: `http://localhost:${PORT}`,
    name: 'sm_session',
    value: `desktop:${DESKTOP_SECRET}`,
    httpOnly: true,
    path: '/',
    expirationDate: Math.floor(Date.now() / 1000) + 86400 * 365,
  })

  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: 900,
    minHeight: 600,
    title: 'ScriptManager',
    show: false,
    backgroundColor: '#0b1020',
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin'
      ? false
      : {
          color: '#090f19',
          symbolColor: '#d8e2f1',
          height: 44,
        },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const revealMainWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    if (windowState.isMaximized) {
      mainWindow.maximize()
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
    splashWindow?.close()
    splashWindow = null
  }

  mainWindow.once('ready-to-show', revealMainWindow)
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(revealMainWindow, 120)
  })
  mainWindow.on('resize', () => saveWindowState(mainWindow!))
  mainWindow.on('move', () => saveWindowState(mainWindow!))
  mainWindow.on('maximize', () => saveWindowState(mainWindow!))
  mainWindow.on('unmaximize', () => saveWindowState(mainWindow!))
  mainWindow.loadURL(`http://localhost:${PORT}`)
  attachDesktopRuntime(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.once('did-finish-load', () => {
    warmWindowDesktopRuntime(mainWindow!)
  })
}

app.whenReady().then(() => {
  ensureDesktopProcessEnv()
  initDesktopRuntimeIpc()
  createApplicationMenu()
  return createWindow()
})

ipcMain.handle('scriptmanager:select-folder', async () => {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow
  const options: OpenDialogOptions = { properties: ['openDirectory'] }
  const result = targetWindow
    ? await dialog.showOpenDialog(targetWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('scriptmanager:reveal-path', async (_event, targetPath: string) => {
  if (!targetPath) {
    return false
  }

  shell.showItemInFolder(targetPath)
  return true
})

ipcMain.handle('scriptmanager:copy-text', async (_event, value: string) => {
  clipboard.writeText(value ?? '')
  return true
})

app.on('window-all-closed', () => {
  serverProcess?.kill()
  splashWindow?.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

app.on('before-quit', () => {
  serverProcess?.kill()
})
