import path from 'node:path'

type DesktopEnvironmentInput = {
  packaged: boolean
  userDataPath: string
  tempPath: string
  cwd: string
  environment: Partial<NodeJS.ProcessEnv>
}

export function getDesktopProcessEnvironment(input: DesktopEnvironmentInput) {
  return {
    DATABASE_URL: input.environment.DATABASE_URL || (input.packaged
      ? `file:${path.join(input.userDataPath, 'scriptmanager.db')}`
      : 'file:./data/scriptmanager.db'),
    SCRIPTS_DIR: input.environment.SCRIPTS_DIR || (input.packaged
      ? path.join(input.userDataPath, 'user_scripts')
      : path.join(input.cwd, 'user_scripts')),
    BUILDS_DIR: input.environment.BUILDS_DIR || (input.packaged
      ? path.join(input.userDataPath, 'builds')
      : path.join(input.tempPath, 'ScriptManager', 'builds')),
  }
}

export function initializeDesktopProcessEnvironment(input: Omit<DesktopEnvironmentInput, 'environment'>) {
  Object.assign(process.env, getDesktopProcessEnvironment({ ...input, environment: process.env }))
}
