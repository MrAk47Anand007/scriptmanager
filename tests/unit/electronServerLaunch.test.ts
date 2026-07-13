import { describe, expect, it } from 'vitest'
import path from 'path'
import { getPackagedServerLaunch } from '../../electron/serverLaunch'

describe('packaged Electron server launch', () => {
  it('uses the Electron executable as its bundled Node runtime', () => {
    expect(getPackagedServerLaunch('C:/app/ScriptManager.exe', 'C:/app/resources')).toEqual({
      executable: 'C:/app/ScriptManager.exe',
      args: [path.join('C:/app/resources', 'standalone', 'server.js')],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
  })
})
