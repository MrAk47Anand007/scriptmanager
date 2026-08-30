import type { ExecutionEvent } from '@/lib/execution/events'

export function matchesNotificationRule(event: ExecutionEvent, eventTypes: string, filterJson = '{}') {
  const types = eventTypes.split(',').map((value) => value.trim()).filter(Boolean)
  if (!types.includes('*') && !types.includes(event.type)) return false
  let filter: Record<string, unknown>
  try {
    const parsed = JSON.parse(filterJson || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    filter = parsed as Record<string, unknown>
  } catch {
    return false
  }
  return Object.entries(filter).every(([key, value]) => {
    if (typeof value !== 'string') return false
    if (key === 'executionKind') return event.executionKind === value
    if (key === 'actorId') return event.actor.id === value
    if (key === 'targetId') return event.target.id === value
    return event.data[key] === value
  })
}
