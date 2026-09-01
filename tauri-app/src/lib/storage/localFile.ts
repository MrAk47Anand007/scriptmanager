import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function atomicWriteLocalFile(filePath: string, content: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`)
  try {
    fs.writeFileSync(temporaryPath, content, { mode: 0o600 })
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true })
    throw error
  }
}

export function getConflictCopyPath(filePath: string, now = new Date()): string {
  const ext = path.extname(filePath)
  const base = filePath.slice(0, filePath.length - ext.length)
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  let candidate = `${base}.conflict-${stamp}${ext}`
  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = `${base}.conflict-${stamp}-${counter++}${ext}`
  }
  return candidate
}
