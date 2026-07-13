function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
export function redactAgentValue<T>(value: T, secrets: string[] = []): T {
  let serialized = JSON.stringify(value)
  for (const secret of secrets.filter(Boolean)) serialized = serialized.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]')
  return JSON.parse(serialized) as T
}
