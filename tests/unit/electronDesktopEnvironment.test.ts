import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDesktopProcessEnvironment } from '../../electron/desktopEnvironment'

describe('Electron desktop process environment', () => {
  it('provides the database and workspace paths before desktop modules load', () => {
    const result = getDesktopProcessEnvironment({
      packaged: true,
      userDataPath: path.join('C:', 'Users', 'Anand', 'AppData', 'Roaming', 'scriptmanager'),
      tempPath: path.join('C:', 'Users', 'Anand', 'AppData', 'Local', 'Temp'),
      cwd: path.join('C:', 'workspace', 'scriptmanager'),
      environment: {},
    })

    expect(result.DATABASE_URL).toBe(`file:${path.join('C:', 'Users', 'Anand', 'AppData', 'Roaming', 'scriptmanager', 'scriptmanager.db')}`)
    expect(result.SCRIPTS_DIR).toBe(path.join('C:', 'Users', 'Anand', 'AppData', 'Roaming', 'scriptmanager', 'user_scripts'))
    expect(result.BUILDS_DIR).toBe(path.join('C:', 'Users', 'Anand', 'AppData', 'Roaming', 'scriptmanager', 'builds'))
  })

  it('preserves explicitly configured paths in development', () => {
    const result = getDesktopProcessEnvironment({
      packaged: false,
      userDataPath: path.join('C:', 'user-data'),
      tempPath: path.join('C:', 'temp'),
      cwd: path.join('C:', 'workspace'),
      environment: {
        DATABASE_URL: 'file:./custom.db',
        SCRIPTS_DIR: 'custom-scripts',
        BUILDS_DIR: 'custom-builds',
      },
    })

    expect(result).toEqual({
      DATABASE_URL: 'file:./custom.db',
      SCRIPTS_DIR: 'custom-scripts',
      BUILDS_DIR: 'custom-builds',
    })
  })
})
