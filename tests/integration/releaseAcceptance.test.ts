import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Phase 10 release acceptance contract', () => {
  it('loads the Electron bootstrap before modules that create Prisma clients', () => {
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'))
    const bootstrap = readFileSync('electron/bootstrap.ts', 'utf8')

    expect(packageManifest.main).toBe('dist-electron/electron/bootstrap.js')
    expect(bootstrap.indexOf('initializeDesktopProcessEnvironment')).toBeLessThan(bootstrap.indexOf("require('./main')"))
  })

  it('ships the Prisma client as a production Electron dependency', () => {
    const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'))

    expect(packageManifest.dependencies?.['@prisma/client']).toBeTruthy()
    expect(packageManifest.devDependencies?.['@prisma/client']).toBeUndefined()
    expect(packageManifest.build?.extraResources).toContainEqual({
      from: 'node_modules/.prisma',
      to: 'node_modules/.prisma',
      filter: ['**/*'],
    })
    expect(packageManifest.build?.extraResources).toContainEqual({
      from: 'node_modules/@prisma/client',
      to: 'node_modules/@prisma/client',
      filter: ['**/*'],
    })
    expect(packageManifest.build?.extraResources).toEqual(expect.arrayContaining([
      { from: '.next/standalone', to: 'standalone' },
      { from: '.next/standalone/node_modules', to: 'standalone/node_modules', filter: ['**/*'] },
      { from: '.next/static', to: 'standalone/.next/static' },
    ]))
  })

  it('covers every production acceptance subsystem with auditable evidence', () => {
    const evidence = JSON.parse(readFileSync('config/production/acceptance.json', 'utf8'))
    expect(evidence.schemaVersion).toBe(1)
    expect(evidence.subsystems).toEqual([
      'webhook', 'api', 'script', 'approval', 'codex', 'claude',
      'remote', 'notification', 'plugin', 'audit-export',
    ])
    expect(evidence.security).toEqual(expect.arrayContaining(['redaction', 'rbac', 'replay-protection', 'request-limits']))
    for (const path of evidence.operatorDocs) expect(existsSync(path), `${path} must exist`).toBe(true)
  })
})
