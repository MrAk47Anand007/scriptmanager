import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { assertPublicSettingKey, filterPublicSettings } from '@/lib/settingsVisibility'

import { cache } from '@/lib/cache'

export async function GET() {
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
  const data = await req.json() as Record<string, string>
  for (const key of Object.keys(data)) assertPublicSettingKey(key)
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
