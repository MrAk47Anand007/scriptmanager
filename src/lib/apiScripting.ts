import vm from 'node:vm'
import type { ApiMaterializedRequest } from '@/lib/apiRequestMaterialization'

export interface ApiConsoleLogEntry {
  phase: 'pre-request' | 'test'
  level: 'log' | 'warn' | 'error'
  message: string
}

export interface ApiTestResult {
  name: string
  passed: boolean
  message: string
}

export interface ApiScriptExecutionResult {
  request: ApiMaterializedRequest
  consoleLogs: ApiConsoleLogEntry[]
  testResults: ApiTestResult[]
}

interface ScriptResponseView {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  duration: number
  size: number
}

function stringifyConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function createAssertionApi(results: ApiTestResult[]) {
  return (actual: unknown) => ({
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`)
      }
    },
    toContain(expected: unknown) {
      const value = String(actual)
      if (!value.includes(String(expected))) {
        throw new Error(`Expected ${value} to contain ${String(expected)}`)
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error('Expected value to be truthy')
      }
    },
  })
}

function runScript(code: string, context: vm.Context) {
  if (!code.trim()) return
  const script = new vm.Script(code)
  script.runInContext(context, { timeout: 1000 })
}

export function executeApiScripts({
  request,
  preRequestScript,
  testScript,
  response,
}: {
  request: ApiMaterializedRequest
  preRequestScript?: string
  testScript?: string
  response?: ScriptResponseView
}): ApiScriptExecutionResult {
  const consoleLogs: ApiConsoleLogEntry[] = []
  const testResults: ApiTestResult[] = []
  const runtimeRequest: ApiMaterializedRequest = JSON.parse(JSON.stringify(request))
  const runtimeVariables = {
    request: new Map<string, string>(),
    environment: new Map<string, string>(),
    global: new Map<string, string>(),
  }

  const makeConsole = (phase: 'pre-request' | 'test') => ({
    log: (...args: unknown[]) => consoleLogs.push({ phase, level: 'log', message: args.map(stringifyConsoleArg).join(' ') }),
    warn: (...args: unknown[]) => consoleLogs.push({ phase, level: 'warn', message: args.map(stringifyConsoleArg).join(' ') }),
    error: (...args: unknown[]) => consoleLogs.push({ phase, level: 'error', message: args.map(stringifyConsoleArg).join(' ') }),
  })

  const makeVarsApi = () => ({
    get(scope: 'request' | 'environment' | 'global', name: string) {
      return runtimeVariables[scope].get(name)
    },
    set(scope: 'request' | 'environment' | 'global', name: string, value: string) {
      runtimeVariables[scope].set(name, String(value))
    },
  })

  const preRequestContext = vm.createContext({
    request: runtimeRequest,
    vars: makeVarsApi(),
    console: makeConsole('pre-request'),
  })
  runScript(preRequestScript ?? '', preRequestContext)

  if (response) {
    const testContext = vm.createContext({
      request: runtimeRequest,
      response,
      vars: makeVarsApi(),
      console: makeConsole('test'),
      test(name: string, fn: () => void) {
        try {
          fn()
          testResults.push({ name, passed: true, message: 'Passed' })
        } catch (error) {
          testResults.push({
            name,
            passed: false,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      },
      expect: createAssertionApi(testResults),
    })
    runScript(testScript ?? '', testContext)
  }

  return {
    request: runtimeRequest,
    consoleLogs,
    testResults,
  }
}
