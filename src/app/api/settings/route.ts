import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const settings = await prisma.setting.findMany()

  const result: Record<string, string> = {}
  for (const s of settings) {
    if (s.value !== null) {
      result[s.key] = s.value
    }
  }

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const data = await req.json() as Record<string, string>

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
