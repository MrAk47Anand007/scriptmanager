import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('release accessibility contract', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')

  it('provides visible keyboard focus and reduced motion', () => {
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (forced-colors: active)')
  })
})
