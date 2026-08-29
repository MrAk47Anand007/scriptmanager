import { describe, expect, it } from 'vitest'
import { withStorageRetry } from '@/lib/storage/retry'

describe('storage retry policy', () => {
  it('retries transient failures with bounded exponential delays', async () => {
    let attempts = 0
    const delays: number[] = []

    await expect(withStorageRetry(async () => {
      attempts += 1
      if (attempts < 3) throw Object.assign(new Error('temporary network failure'), { code: 'ECONNRESET' })
      return 'ok'
    }, { baseDelayMs: 25, sleep: async (delay) => { delays.push(delay) } })).resolves.toBe('ok')

    expect(attempts).toBe(3)
    expect(delays).toEqual([25, 50])
  })

  it('does not retry permanent authorization failures', async () => {
    let attempts = 0

    await expect(withStorageRetry(async () => {
      attempts += 1
      throw Object.assign(new Error('unauthorized'), { status: 401 })
    }, { sleep: async () => undefined })).rejects.toThrow('unauthorized')

    expect(attempts).toBe(1)
  })
})
