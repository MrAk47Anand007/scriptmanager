import type { PrismaClient } from '@prisma/client'

export function clampRetentionDays(value: number | undefined, fallback = 30) {
  return Math.min(3650, Math.max(1, Number.isFinite(value) ? Math.floor(value as number) : fallback))
}

export async function cleanupObservabilityData(database: PrismaClient, input: { eventDays?: number; now?: Date } = {}) {
  const now = input.now ?? new Date()
  const eventDays = clampRetentionDays(input.eventDays)
  const before = new Date(now.getTime() - eventDays * 86_400_000)
  const events = await database.executionEvent.deleteMany({ where: { occurredAt: { lt: before } } })
  return { deletedEvents: events.count, eventDays, before: before.toISOString() }
}

