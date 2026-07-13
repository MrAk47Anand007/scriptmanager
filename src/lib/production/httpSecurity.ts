export interface RateLimitOptions { limit: number; windowMs: number }
export interface RateLimitEntry { count: number; resetAt: number }

export function checkRateLimit(state: Map<string, RateLimitEntry>, identity: string, now: number, options: RateLimitOptions) {
  const current = state.get(identity)
  const entry = !current || now >= current.resetAt ? { count: 0, resetAt: now + options.windowMs } : current
  entry.count += 1
  state.set(identity, entry)
  return { allowed: entry.count <= options.limit, remaining: Math.max(0, options.limit - entry.count), retryAfterMs: Math.max(0, entry.resetAt - now) }
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error(`Request body exceeds ${maxBytes} bytes`)
  const body = new Uint8Array(await request.arrayBuffer())
  if (body.byteLength > maxBytes) throw new Error(`Request body exceeds ${maxBytes} bytes`)
  return body
}

export function verifyReplayWindow(timestamp: string | null, nowMs = Date.now(), windowMs = 300_000): number {
  if (!timestamp || !/^\d+$/.test(timestamp)) throw new Error('Missing or invalid webhook timestamp')
  const timestampMs = Number(timestamp) * 1_000
  if (Math.abs(nowMs - timestampMs) > windowMs) throw new Error('Webhook timestamp is outside the allowed replay window')
  return timestampMs
}

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: https:" },
  { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
] as const
