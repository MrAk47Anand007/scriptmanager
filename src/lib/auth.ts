import crypto from 'crypto'
import { promisify } from 'util'

const pbkdf2 = promisify(crypto.pbkdf2)

// Session token secret — derived from SESSION_SECRET env var or a fallback
// Production: set SESSION_SECRET to a random string in your .env
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'scriptmanager-dev-secret-change-me'
const ITERATIONS = 100_000
const KEY_LEN = 64
const DIGEST = 'sha512'

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA512)
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const dk = await pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST)
  return `pbkdf2$${ITERATIONS}$${salt}$${dk.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, iters, salt, hash] = stored.split('$')
    const dk = await pbkdf2(password, salt, parseInt(iters, 10), KEY_LEN, DIGEST)
    return crypto.timingSafeEqual(Buffer.from(dk.toString('hex')), Buffer.from(hash))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Session token (HMAC-SHA256 signed, 24h expiry)
// Format: base64(payload).base64(signature)
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function sign(data: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url')
}

export function createSessionToken(): string {
  const expiry = Date.now() + SESSION_TTL_MS
  const payload = Buffer.from(JSON.stringify({ expiry })).toString('base64url')
  const sig = sign(payload)
  return `${payload}.${sig}`
}

export function validateSessionToken(token: string | undefined): boolean {
  if (!token) return false
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return false
    const expectedSig = sign(payload)
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return false
    const { expiry } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return Date.now() < expiry
  } catch {
    return false
  }
}

export const SESSION_COOKIE = 'sm_session'
