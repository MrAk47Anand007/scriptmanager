import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function run() {
  const filePath = path.join(__dirname, 'src', 'lib', 'scriptsRuntimeClient.ts')
  let content = await fs.readFile(filePath, 'utf-8')

  content = content.replace(
    /export async function listDesktopScripts[\s\S]*?as Promise<DesktopScriptRecord\[\]>[\r\n\s]*\}/m,
    `export async function listDesktopScripts(): Promise<DesktopScriptRecord[]> {\n  return invoke('get_scripts');\n}`
  )
  content = content.replace(
    /export async function createDesktopScript[\s\S]*?\.createScript\(payload\)[\r\n\s]*\}/m,
    `export async function createDesktopScript(payload: DesktopCreateScriptPayload): Promise<DesktopScriptRecord> {\n  return invoke('create_script', { payload });\n}`
  )
  content = content.replace(
    /export async function listDesktopCollections[\s\S]*?as Promise<DesktopCollectionRecord\[\]>[\r\n\s]*\}/m,
    `export async function listDesktopCollections(): Promise<DesktopCollectionRecord[]> {\n  return invoke('get_collections');\n}`
  )

  await fs.writeFile(filePath, content, 'utf-8')

  const settingsPath = path.join(__dirname, 'src', 'lib', 'settingsRuntimeClient.ts')
  let settingsContent = await fs.readFile(settingsPath, 'utf-8')
  settingsContent = settingsContent.replace(
    /export async function readDesktopSettings[\s\S]*?\.readSettings\(\)[\r\n\s]*\}/m,
    `export async function readDesktopSettings(): Promise<DesktopSettings> {\n  return invoke('get_settings');\n}`
  )
  await fs.writeFile(settingsPath, settingsContent, 'utf-8')
  
  console.log('IPC patched successfully')
}

run().catch(console.error)
