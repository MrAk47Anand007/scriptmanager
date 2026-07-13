import type { ExecutionEvent } from '@/lib/execution/events'
import { redactExecutionValue } from '@/lib/execution/events'
import type { NotificationMessage } from './types'

function render(text: string, event: ExecutionEvent) {
  const safeData = redactExecutionValue(event.data) as Record<string, unknown>
  const values: Record<string, string> = { type:event.type, executionKind:event.executionKind, correlationId:event.correlationId, actor:event.actor.name ?? event.actor.id, target:event.target.name ?? event.target.id }
  return text.replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => String(values[key] ?? safeData[key] ?? '')).slice(0, 4000)
}

export function renderNotification(templateJson: string, event: ExecutionEvent): NotificationMessage {
  const template = JSON.parse(templateJson || '{}') as Partial<NotificationMessage>
  return redactExecutionValue({ title: render(template.title ?? 'ScriptManager event', event), body: render(template.body ?? '{{type}} for {{target}}', event), deepLink: template.deepLink ? render(template.deepLink, event) : undefined, data: { eventId:event.id, correlationId:event.correlationId } }) as NotificationMessage
}
