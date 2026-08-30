import { assertSafeBuildId } from '@/lib/executionSafety'

const DEFAULT_TERMINAL_SESSION_ID = 'terminal-1'
const MAX_TERMINAL_SESSION_ID_LENGTH = 128
const MAX_TERMINAL_INPUT_LENGTH = 1_000_000
const MAX_TERMINAL_DIMENSION = 500
const MAX_IDENTIFIER_LENGTH = 128
const MAX_PARAMETER_COUNT = 100
const MAX_PARAMETER_VALUE_LENGTH = 64 * 1024
const MAX_PARAMETER_BYTES = 1_000_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalString(input: Record<string, unknown>, key: string, maxLength: number, required = false): string | undefined {
  if (!(key in input)) {
    if (required) throw new Error(`${key} is required`)
    return undefined
  }
  if (typeof input[key] !== 'string') throw new Error(`${key} must be a string`)
  const value = input[key].trim()
  if (!value && required) throw new Error(`${key} is required`)
  if (value.length > maxLength) throw new Error(`${key} is too long`)
  if (value.includes('\0')) throw new Error(`${key} contains an invalid character`)
  return value || undefined
}

export function normalizeTerminalSessionId(value: unknown): string {
  if (value === undefined || value === null || value === '') return DEFAULT_TERMINAL_SESSION_ID
  if (typeof value !== 'string') throw new Error('Terminal session must be a string')
  const sessionId = value.trim()
  if (!sessionId || sessionId.length > MAX_TERMINAL_SESSION_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(sessionId)) {
    throw new Error('Terminal session is invalid')
  }
  return sessionId
}

export function parseTerminalInputPayload(value: unknown): { sessionId: string; data: string } {
  if (!isRecord(value)) throw new Error('Terminal input payload is invalid')
  const data = value.data
  if (typeof data !== 'string' || data.length > MAX_TERMINAL_INPUT_LENGTH) throw new Error('Terminal input data is invalid')
  return { sessionId: normalizeTerminalSessionId(value.sessionId), data }
}

export function parseTerminalResizePayload(value: unknown): { sessionId: string | undefined; cols: number; rows: number } {
  if (!isRecord(value)) throw new Error('Terminal resize payload is invalid')
  if (typeof value.cols !== 'number' || typeof value.rows !== 'number' || !Number.isInteger(value.cols) || !Number.isInteger(value.rows) || value.cols < 1 || value.rows < 1 || value.cols > MAX_TERMINAL_DIMENSION || value.rows > MAX_TERMINAL_DIMENSION) {
    throw new Error('Terminal dimensions are invalid')
  }
  return { sessionId: value.sessionId === undefined ? undefined : normalizeTerminalSessionId(value.sessionId), cols: value.cols, rows: value.rows }
}

export function parseScriptExecutionPayload(value: unknown): { scriptId: string; buildId?: string; paramValues?: Record<string, string> } {
  if (!isRecord(value)) throw new Error('Script execution payload is invalid')
  const scriptId = readOptionalString(value, 'scriptId', MAX_IDENTIFIER_LENGTH, true)!
  const buildId = readOptionalString(value, 'buildId', MAX_IDENTIFIER_LENGTH)
  let paramValues: Record<string, string> | undefined

  if (value.paramValues !== undefined) {
    if (!isRecord(value.paramValues)) throw new Error('Parameter values must be an object')
    const entries = Object.entries(value.paramValues)
    if (entries.length > MAX_PARAMETER_COUNT) throw new Error('Too many parameter values')
    let totalLength = 0
    paramValues = {}
    for (const [key, parameterValue] of entries) {
      if (typeof parameterValue !== 'string' || key.length > MAX_IDENTIFIER_LENGTH || parameterValue.includes('\0') || parameterValue.length > MAX_PARAMETER_VALUE_LENGTH) {
        throw new Error('Parameter values are invalid')
      }
      totalLength += key.length + parameterValue.length
      if (totalLength > MAX_PARAMETER_BYTES) throw new Error('Parameter values are too large')
      paramValues[key] = parameterValue
    }
  }

  return { scriptId, ...(buildId ? { buildId: assertSafeBuildId(buildId) } : {}), ...(paramValues ? { paramValues } : {}) }
}
