import path from 'node:path'

const environment = process.env as Record<string, string | undefined>
if (!environment.NODE_ENV) environment.NODE_ENV = 'test'
process.env.DATABASE_URL ??= `file:${path.resolve('data', 'vitest.db')}`
process.env.DESKTOP_AUTH_SECRET ??= 'vitest-desktop-secret'
