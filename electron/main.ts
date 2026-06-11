import { app, BrowserWindow, session, ipcMain, dialog, OpenDialogOptions, shell, clipboard, Menu, type MenuItemConstructorOptions } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import fs from 'fs'
import { attachDesktopRuntime, initDesktopRuntimeIpc } from './desktopRuntime'

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
    backgroundColor: '#1d1c1b',
    alwaysOnTop: true,
    webPreferences: {
      sandbox: false,
    },
  })

  const splashHtml = `
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>ScriptManager</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg: #1d1c1b;
          --glass: rgba(255, 255, 255, 0.03);
          --glass-border: rgba(255, 255, 255, 0.08); /* slight border */
          --accent-1: #d97757; /* terracotta */
          --accent-2: #e69373; /* light terracotta */
          --accent-3: #c45f3f; /* deep terracotta */
          --text: #f5f5f4;
          --text-muted: #a8a29e;
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          background-color: var(--bg);
          font-family: 'Outfit', -apple-system, sans-serif;
          color: var(--text);
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          user-select: none;
          -webkit-font-smoothing: antialiased;
        }

        /* Animated background orbs */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          z-index: 0;
          opacity: 0.6;
          animation: float 10s infinite ease-in-out alternate;
        }
        .orb-1 {
          width: 300px;
          height: 300px;
          background: var(--accent-1);
          top: -100px;
          left: -100px;
        }
        .orb-2 {
          width: 400px;
          height: 400px;
          background: var(--accent-2);
          bottom: -150px;
          right: -100px;
          animation-delay: -5s;
        }
        .orb-3 {
          width: 250px;
          height: 250px;
          background: var(--accent-3);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          opacity: 0.4;
          animation-duration: 15s;
        }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, -40px) scale(1.1); }
        }

        /* Glassmorphism Card */
        .glass-card {
          position: relative;
          z-index: 10;
          width: 88%;
          height: 82%;
          background: linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          padding: 36px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
          animation: popup 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }

        @keyframes popup {
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Header */
        .header {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .logo-wrap {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          justify-content: center;
          align-items: center;
          background: linear-gradient(135deg, var(--accent-1), var(--accent-2));
          border-radius: 18px;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.5), inset 0 2px 4px rgba(255,255,255,0.3);
          font-size: 26px;
          font-weight: 700;
          color: #fff;
          font-family: monospace;
          overflow: hidden;
        }

        .logo-wrap::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent);
          transform: rotate(45deg) translateX(-100%);
          animation: shine 4s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes shine {
          0%, 20% { transform: rotate(45deg) translateX(-100%); }
          80%, 100% { transform: rotate(45deg) translateX(100%); }
        }

        .title-box {
          display: flex;
          flex-direction: column;
        }

        .badge {
          align-self: flex-start;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #60a5fa;
          padding: 4px 10px;
          border-radius: 99px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .title {
          font-size: 32px;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(to right, #fff, #cbd5e1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -1px;
        }

        /* Body text */
        .message {
          margin-top: 24px;
          font-size: 15px;
          font-weight: 400;
          color: var(--text-muted);
          line-height: 1.6;
          max-width: 95%;
        }

        /* Footer / Loading */
        .footer {
          margin-top: auto;
          width: 100%;
        }

        .status-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin-bottom: 12px;
        }

        .status-labels .left {
          color: var(--text-muted);
        }

        .status-labels .right {
          color: #fff;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Loader pulse dot */
        .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: var(--accent-3);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--accent-3);
          animation: heart-beat 1.5s infinite;
        }

        @keyframes heart-beat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.6); opacity: 0.5; }
        }

        /* Progress bar */
        .track {
          width: 100%;
          height: 4px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
          position: relative;
        }

        .bar {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 50%;
          background: linear-gradient(90deg, transparent, var(--accent-2), var(--accent-1), var(--accent-3), transparent);
          background-size: 200% 100%;
          border-radius: 10px;
          animation: scroll-gradient 2s linear infinite, slide-bar 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes scroll-gradient {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        @keyframes slide-bar {
          0% { transform: translateX(-100%); width: 30%; }
          50% { width: 60%; }
          100% { transform: translateX(250%); width: 30%; }
        }
      </style>
    </head>
    <body>
      <!-- Ambient Background -->
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>

      <!-- Main Card -->
      <div class="glass-card">
        <div class="header">
          <div class="logo-wrap">&lt;/&gt;</div>
          <div class="title-box">
            <div class="badge">Desktop Environment</div>
            <h1 class="title">ScriptManager</h1>
          </div>
        </div>
        
        <div class="message">
          Initializing a secure local workspace. Setting up the embedded runtime and compiling your tools for an ultra-fast desktop experience.
        </div>
        
        <div class="footer">
          <div class="status-labels">
            <span class="left">Booting Engine</span>
            <span class="right">Please Wait <div class="pulse-dot"></div></span>
          </div>
          <div class="track">
            <div class="bar"></div>
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
    backgroundColor: '#1d1c1b',
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'darwin'
      ? false
      : {
          color: '#161514',
          symbolColor: '#e8e6e3',
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

ipcMain.handle('scriptmanager:read-text', async () => {
  return clipboard.readText()
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
