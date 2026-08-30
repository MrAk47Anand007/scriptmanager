export function isTrustedAppUrl(value: string, port: number): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && url.hostname === 'localhost' && url.port === String(port)
  } catch {
    return false
  }
}
