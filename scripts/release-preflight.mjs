import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const compatibility = JSON.parse(await readFile(new URL('../config/production/compatibility.json', import.meta.url), 'utf8'))
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl?.startsWith('file:')) throw new Error('DATABASE_URL must point to a SQLite file')
if (process.env.NODE_ENV === 'production' && (!process.env.AUTH_SECRET || !process.env.SESSION_SECRET || !process.env.SCRIPTMANAGER_MASTER_KEY)) {
  throw new Error('Production requires AUTH_SECRET, SESSION_SECRET, and SCRIPTMANAGER_MASTER_KEY')
}
const databasePath = resolve('prisma', databaseUrl.slice(5).replace(/^\.\//, ''))
await access(databasePath)
console.log(JSON.stringify({ ok: true, databasePath, targetVersion: compatibility.appVersion, schemaRange: [compatibility.minSchemaVersion, compatibility.maxSchemaVersion] }))
