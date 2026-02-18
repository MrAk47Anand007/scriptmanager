import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

  await cache.set('settings', result, 60 * 60) // Cache settings for 1 hour

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const data = await req.json() as Record<string, string>
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
