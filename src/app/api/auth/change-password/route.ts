import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/auth'

// POST /api/auth/change-password — change the master password
export async function POST(req: Request) {
  const { currentPassword, newPassword } = await req.json()
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 1) {
    return NextResponse.json({ error: 'New password required' }, { status: 400 })
  }

  const stored = await prisma.setting.findUnique({ where: { key: 'auth_password_hash' } })

  if (stored?.value) {
    // Password already set — must verify current password
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 })
    }
    const valid = await verifyPassword(currentPassword, stored.value)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }
  }

  const hash = await hashPassword(newPassword)
  await prisma.setting.upsert({
    where: { key: 'auth_password_hash' },
    update: { value: hash },
    create: { key: 'auth_password_hash', value: hash },
  })

  return NextResponse.json({ ok: true })
}
