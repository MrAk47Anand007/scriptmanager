import fs from 'node:fs'
import path from 'node:path'

export function moveManagedScriptFile(sourcePath: string, destinationDirectory: string, filename: string): string {
  const source = path.resolve(sourcePath)
  const destination = path.resolve(destinationDirectory, path.basename(filename))
  if (source === destination) return destination
  if (!fs.existsSync(source)) throw new Error('Script file not found')
  if (!fs.statSync(source).isFile()) throw new Error('Script source is not a file')
  if (fs.existsSync(destination)) throw new Error('A script file with that name already exists')

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.renameSync(source, destination)
  return destination
}
