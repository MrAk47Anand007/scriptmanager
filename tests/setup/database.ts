import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default async function setupDatabase() {
  const environment = process.env as Record<string, string | undefined>
  if (!environment.NODE_ENV) environment.NODE_ENV = 'test'
  process.env.DATABASE_URL ??= `file:${path.resolve('data', 'vitest.db')}`
  process.env.DESKTOP_AUTH_SECRET ??= 'vitest-desktop-secret'

  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
    env: process.env,
    stdio: 'inherit',
  })
}
