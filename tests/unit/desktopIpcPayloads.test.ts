import { describe, expect, it } from 'vitest'
import { normalizeTerminalSessionId, parseScriptExecutionPayload, parseTerminalInputPayload, parseTerminalResizePayload } from '@/lib/runtime/desktopIpcPayloads'

describe('desktop IPC payload validation', () => {
  it('normalizes bounded terminal session identifiers', () => {
    expect(normalizeTerminalSessionId(undefined)).toBe('terminal-1')
    expect(normalizeTerminalSessionId(' terminal-2 ')).toBe('terminal-2')
    expect(() => normalizeTerminalSessionId('bad\nterminal')).toThrow('session')
    expect(() => normalizeTerminalSessionId('x'.repeat(129))).toThrow('session')
  })

  it('rejects non-string or oversized terminal input', () => {
    expect(parseTerminalInputPayload({ sessionId: 'terminal-2', data: 'ls\n' })).toEqual({ sessionId: 'terminal-2', data: 'ls\n' })
    expect(() => parseTerminalInputPayload({ data: 42 })).toThrow('data')
    expect(() => parseTerminalInputPayload({ data: 'x'.repeat(1_000_001) })).toThrow('data')
  })

  it('accepts only practical terminal dimensions', () => {
    expect(parseTerminalResizePayload({ cols: 80, rows: 24 })).toEqual({ sessionId: undefined, cols: 80, rows: 24 })
    expect(() => parseTerminalResizePayload({ cols: 0, rows: 24 })).toThrow('dimensions')
    expect(() => parseTerminalResizePayload({ cols: 80.5, rows: 24 })).toThrow('dimensions')
    expect(() => parseTerminalResizePayload({ cols: 501, rows: 24 })).toThrow('dimensions')
  })

  it('validates script execution identifiers and parameter values', () => {
    expect(parseScriptExecutionPayload({ scriptId: ' script-1 ', paramValues: { ENV: 'test' } })).toEqual({ scriptId: 'script-1', paramValues: { ENV: 'test' } })
    expect(() => parseScriptExecutionPayload({ scriptId: '' })).toThrow('scriptId')
    expect(() => parseScriptExecutionPayload({ scriptId: 'script-1', paramValues: { ENV: 42 } })).toThrow('Parameter')
    expect(() => parseScriptExecutionPayload({ scriptId: 'script-1', buildId: 'x'.repeat(129) })).toThrow('buildId')
  })
})
