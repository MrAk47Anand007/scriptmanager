import type { ExecutionEvent } from '@/lib/execution/events'
import { redactExecutionValue } from '@/lib/execution/events'
import type { NotificationMessage } from './types'

function render(text: string, event: ExecutionEvent) {
  const safeData = redactExecutionValue(event.data) as Record<string, unknown>
  const values: Record<string, string> = { type:event.type, executionKind:event.executionKind, correlationId:event.correlationId, actor:event.actor.name ?? event.actor.id, target:event.target.name ?? event.target.id }
  return text.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => String(values[key] ?? safeData[key] ?? '')).slice(0, 4000)
}

export function renderNotification(templateJson: string, event: ExecutionEvent): NotificationMessage {
  let template: Partial<NotificationMessage> = {}
  try {
    const parsed = JSON.parse(templateJson || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) template = parsed as Partial<NotificationMessage>
  } catch {
    // A malformed persisted template should not prevent other rules from running.
  }
  const title = typeof template.title === 'string' ? template.title : 'ScriptManager event'
  const body = typeof template.body === 'string' ? template.body : '{{type}} for {{target}}'
  const deepLink = typeof template.deepLink === 'string' && template.deepLink ? render(template.deepLink, event) : undefined
  return redactExecutionValue({ title: render(title, event), body: render(body, event), deepLink, data: { eventId:event.id, correlationId:event.correlationId } }) as NotificationMessage
}
