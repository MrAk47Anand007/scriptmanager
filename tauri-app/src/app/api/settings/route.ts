import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { filterPublicSettings, parsePublicSettings } from '@/lib/settingsVisibility'

import { cache } from '@/lib/cache'
import { authorizeRequest } from '@/lib/rbac/routeAuthorization'

export async function GET(request: Request) {
  const authorization = await authorizeRequest(request, 'session', 'read')
  if (authorization.response) return authorization.response
  const cachedSettings = await cache.get('settings')
  if (cachedSettings) {
    return NextResponse.json(cachedSettings)
  }

  const settings = await prisma.setting.findMany()

  const result: Record<string, string> = {}
  for (const s of settings) {
    if (s.value !== null) {
      result[s.key] = s.value
    }
  }

  const publicSettings = filterPublicSettings(result)
  await cache.set('settings', publicSettings, 60 * 60) // Cache settings for 1 hour

  return NextResponse.json(publicSettings)
}

export async function POST(req: Request) {
  const authorization = await authorizeRequest(req, 'session', 'manage')
  if (authorization.response) return authorization.response
  let data: Record<string, string>
  try {
    data = parsePublicSettings(await req.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Settings payload is invalid' }, { status: 400 })
  }
  await cache.del('settings') // Invalidate settings cache


  // Batch all upserts in a single transaction for atomicity and speed
  await prisma.$transaction(
    Object.entries(data).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value ?? '' },
        create: { key, value: value ?? '' }
      })
    )
  )

  return NextResponse.json({ message: 'Settings saved' })
}
