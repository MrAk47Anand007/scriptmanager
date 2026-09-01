export type StorageRetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
}

function retryableError(error: unknown): boolean {
  const candidate = error as { status?: unknown; code?: unknown }
  if (typeof candidate.status === 'number') {
    return candidate.status === 408 || candidate.status === 425 || candidate.status === 429 || candidate.status >= 500
  }

  if (typeof candidate.code === 'string' && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EAI_AGAIN'].includes(candidate.code)) {
    return true
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('network') || message.includes('timeout') || message.includes('fetch failed') || message.includes('temporarily unavailable')
}

export async function withStorageRetry<T>(operation: () => Promise<T>, options: StorageRetryOptions = {}): Promise<T> {
  const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 3, 1), 5)
  const baseDelayMs = Math.max(options.baseDelayMs ?? 250, 0)
  const maxDelayMs = Math.max(options.maxDelayMs ?? 4_000, baseDelayMs)
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)))

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= maxAttempts || !retryableError(error)) throw error
      await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs))
    }
  }

  throw new Error('Storage operation failed')
}
