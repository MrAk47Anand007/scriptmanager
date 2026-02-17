import { app, BrowserWindow, session } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import http from 'http'
import crypto from 'crypto'

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
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ScriptManager',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  serverProcess?.kill()
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
