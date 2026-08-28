import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { readCookieJar, writeCookieJar } from '@/lib/executeApiRequest'

beforeEach(async () => {
  await prisma.setting.deleteMany({
    where: {
      key: {
        startsWith: 'api_cookie_jar',
      },
    },
  })
})

afterEach(async () => {
  await prisma.setting.deleteMany({
    where: {
      key: {
        startsWith: 'api_cookie_jar',
      },
    },
  })
})

describe('API cookie jar isolation', () => {
  it('stores cookies per workspace instead of globally', async () => {
    await writeCookieJar('workspace-a', {
      'example.test': { sid: 'cookie-a' },
    })
    await writeCookieJar('workspace-b', {
      'example.test': { sid: 'cookie-b' },
    })

    await expect(readCookieJar('workspace-a')).resolves.toEqual({
      'example.test': { sid: 'cookie-a' },
    })
    await expect(readCookieJar('workspace-b')).resolves.toEqual({
      'example.test': { sid: 'cookie-b' },
    })
  })
})
