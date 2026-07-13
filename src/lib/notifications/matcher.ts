import type { ExecutionEvent } from '@/lib/execution/events'

export function matchesNotificationRule(event: ExecutionEvent, eventTypes: string, filterJson = '{}') {
  const types = eventTypes.split(',').map((value) => value.trim()).filter(Boolean)
  if (!types.includes('*') && !types.includes(event.type)) return false
  const filter = JSON.parse(filterJson) as Record<string, string>
  return Object.entries(filter).every(([key, value]) => {
    if (key === 'executionKind') return event.executionKind === value
    if (key === 'actorId') return event.actor.id === value
    if (key === 'targetId') return event.target.id === value
    return event.data[key] === value
  })
}
