import path from 'path'

export function getPackagedServerLaunch(execPath: string, resourcesPath: string) {
  return {
    executable: execPath,
    args: [path.join(resourcesPath, 'standalone', 'server.js')],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  }
}
