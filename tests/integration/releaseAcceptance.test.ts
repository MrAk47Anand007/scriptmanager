import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Phase 10 release acceptance contract', () => {
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
