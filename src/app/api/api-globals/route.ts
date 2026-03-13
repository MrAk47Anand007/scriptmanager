import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const API_GLOBALS_KEY = 'api_global_variables'

export async function GET() {
  const setting = await prisma.setting.findUnique({ where: { key: API_GLOBALS_KEY } })

  return NextResponse.json({
    variables: setting?.value ?? '[]',
  })
}

export async function PUT(req: Request) {
  const { variables } = await req.json()

  const setting = await prisma.setting.upsert({
    where: { key: API_GLOBALS_KEY },
    update: { value: variables ?? '[]' },
    create: { key: API_GLOBALS_KEY, value: variables ?? '[]' },
  })

  return NextResponse.json({
    variables: setting.value ?? '[]',
  })
}
