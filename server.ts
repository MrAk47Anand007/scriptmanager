import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import path from 'path'

// Set module resolution paths for custom server context
process.env.NODE_PATH = path.join(__dirname, 'src')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME ?? 'localhost'
const port = parseInt(process.env.PORT ?? '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  // Initialize the scheduler ONCE on server start (long-lived singleton)
  try {
    // Dynamic import to avoid circular deps during build
    const { initScheduler } = await import('./src/lib/schedulerService')
    await initScheduler()
  } catch (err) {
    console.error('[Server] Failed to initialize scheduler:', err)
  }

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal server error')
    }
  })

  // Initialize Terminal WebSocket Server
  try {
    const { initWebSocketServer } = await import('./src/lib/socketService')
    initWebSocketServer(server)
  } catch (err) {
    console.error('[Server] Failed to load socket service:', err)
  }

  server.listen(port, () => {
    console.log(`\n✓ ScriptManager is running at http://${hostname}:${port}`)
    console.log(`  Scripts dir: ${process.env.SCRIPTS_DIR ?? './user_scripts'}`)
    console.log(`  Builds dir:  ${process.env.BUILDS_DIR ?? './builds'}`)
    console.log(`  Database:    ${process.env.DATABASE_URL ?? 'file:./data/scriptmanager.db'}\n`)
  })
})
