import { app, BrowserWindow, session, ipcMain, dialog, OpenDialogOptions, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import fs from 'fs'

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
    width: 440,
    height: 280,
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
            background:
              radial-gradient(circle at top, rgba(59, 130, 246, 0.22), transparent 40%),
              linear-gradient(180deg, #10172a 0%, #090d18 100%);
            color: #e2e8f0;
            font-family: "Segoe UI", system-ui, sans-serif;
          }
          .shell {
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
          }
          .card {
            width: 300px;
            padding: 28px 26px;
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.82);
            border: 1px solid rgba(148, 163, 184, 0.18);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 10px;
          }
          .mark {
            width: 30px;
            height: 30px;
            border-radius: 10px;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #2563eb, #0ea5e9);
            color: white;
            font-weight: 800;
          }
          .subtle {
            color: #94a3b8;
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 18px;
          }
          .bar {
            height: 6px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(51, 65, 85, 0.85);
          }
          .bar::after {
            content: "";
            display: block;
            width: 42%;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, #3b82f6, #38bdf8);
            animation: pulse 1.15s ease-in-out infinite alternate;
          }
          @keyframes pulse {
            from { transform: translateX(0); }
            to { transform: translateX(140%); }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="card">
            <div class="brand">
              <div class="mark">&lt;/&gt;</div>
              <div>ScriptManager</div>
            </div>
            <div class="subtle">Starting the local workspace and preparing your tools.</div>
            <div class="bar"></div>
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
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
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
