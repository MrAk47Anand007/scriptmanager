import path from 'node:path'
import { assertSafeBuildId } from './executionSafety'

export function buildLogPath(buildsDir: string, scriptFilename: string, buildId: string): string {
  const safeScriptDir = path.basename(scriptFilename).replace(/[^a-zA-Z0-9_.-]/g, '_')
  return path.resolve(buildsDir, safeScriptDir, `${assertSafeBuildId(buildId)}.log`)
}

export function isManagedBuildLogPath(buildsDir: string, logFile: string, buildId: string): boolean {
  try {
    const rootPath = path.resolve(buildsDir)
    const candidatePath = path.resolve(logFile)
    const relativeParent = path.relative(rootPath, path.dirname(candidatePath))
    return relativeParent !== ''
      && !relativeParent.startsWith('..')
      && !path.isAbsolute(relativeParent)
      && !relativeParent.includes(path.sep)
      && path.basename(candidatePath) === `${assertSafeBuildId(buildId)}.log`
  } catch {
    return false
  }
}
