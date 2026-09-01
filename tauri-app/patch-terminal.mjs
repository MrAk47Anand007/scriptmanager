import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function run() {
  const filePath = path.join(__dirname, 'src', 'lib', 'scriptsRuntimeClient.ts')
  let content = await fs.readFile(filePath, 'utf-8')

  content = content.replace(
    /export async function warmScriptsTerminal[\s\S]*?\.warmTerminal\(sessionId\)[\r\n\s]*\}/m,
    `export async function warmScriptsTerminal(sessionId = DEFAULT_TERMINAL_SESSION_ID): Promise<void> {\n  return invoke('create_terminal', { sessionId });\n}`
  )
  content = content.replace(
    /export async function sendDesktopTerminalInput[\s\S]*?\.sendTerminalInput\(sessionId, data\)[\r\n\s]*\}/m,
    `export async function sendDesktopTerminalInput(data: string, sessionId = DEFAULT_TERMINAL_SESSION_ID) {\n  return invoke('write_terminal', { sessionId, data });\n}`
  )
  content = content.replace(
    /export async function resizeDesktopTerminal[\s\S]*?\.resizeTerminal\(sessionId, cols, rows\)[\r\n\s]*\}/m,
    `export async function resizeDesktopTerminal(cols: number, rows: number, sessionId = DEFAULT_TERMINAL_SESSION_ID) {\n  return invoke('resize_terminal', { sessionId, cols, rows });\n}`
  )

  await fs.writeFile(filePath, content, 'utf-8')
  console.log('Terminal IPC patched successfully')
}

run().catch(console.error)
