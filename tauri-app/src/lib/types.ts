export interface ScriptParameter {
  name: string          // e.g. "API_KEY" — injected as env var of same name
  type: 'string' | 'number' | 'boolean'
  required: boolean
  defaultValue?: string
  description?: string
}
