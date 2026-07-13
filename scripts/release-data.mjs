import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, resolve } from 'node:path'

function usage() {
  console.log('Usage: node scripts/release-data.mjs <backup|restore> <database> <backup-file>')
}

async function digest(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function backup(database, destination) {
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp-${process.pid}`
  await copyFile(database, temporary)
  const info = await stat(temporary)
  const manifest = { format: 1, createdAt: new Date().toISOString(), database: basename(destination), sha256: await digest(temporary), bytes: info.size }
  await rename(temporary, destination)
  await writeFile(`${destination}.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  console.log(`Backup created: ${destination}`)
}

async function restore(database, source) {
  const manifest = JSON.parse(await readFile(`${source}.json`, 'utf8'))
  const info = await stat(source)
  if (manifest.format !== 1 || manifest.database !== basename(source) || manifest.bytes !== info.size || manifest.sha256 !== await digest(source)) {
    throw new Error('Backup manifest or checksum validation failed')
  }
  const temporary = `${database}.restore-${process.pid}`
  await mkdir(dirname(database), { recursive: true })
  await copyFile(source, temporary)
  await rename(temporary, database)
  console.log(`Database restored: ${database}`)
}

const [command, databaseArg, backupArg] = process.argv.slice(2)
if (!['backup', 'restore'].includes(command) || !databaseArg || !backupArg) { usage(); process.exitCode = 2 }
else {
  const database = resolve(databaseArg)
  const archive = resolve(backupArg)
  await (command === 'backup' ? backup(database, archive) : restore(database, archive))
}
