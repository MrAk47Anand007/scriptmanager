import { describe, expect, it } from 'vitest'
import { advanceDesktopNotificationCursor, parseDesktopNotificationPayload } from '@/lib/desktopNotificationPoller'

describe('desktop notification poller', () => {
  it('accepts only delivered desktop payloads and keeps deep links internal', () => {
    expect(parseDesktopNotificationPayload({
      id: 'delivery-1',
      status: 'delivered',
      attemptCount: 1,
      createdAt: '2026-08-30T00:00:01.000Z',
      payloadJson: JSON.stringify({ title: 'Approval', body: 'Review request', deepLink: '/approvals/request-1' }),
      channel: { id: 'channel-1', name: 'Desktop', kind: 'desktop' },
    })).toEqual({ title: 'Approval', body: 'Review request', deepLink: '/approvals/request-1' })

    expect(parseDesktopNotificationPayload({
      id: 'delivery-2',
      status: 'delivered',
      attemptCount: 1,
      createdAt: '2026-08-30T00:00:02.000Z',
      payloadJson: JSON.stringify({ title: 'External', body: 'Do not navigate', deepLink: 'https://example.test' }),
      channel: { id: 'channel-1', name: 'Desktop', kind: 'desktop' },
    })).toEqual({ title: 'External', body: 'Do not navigate' })

    expect(parseDesktopNotificationPayload({
      id: 'delivery-3',
      status: 'retrying',
      attemptCount: 1,
      createdAt: '2026-08-30T00:00:03.000Z',
      payloadJson: JSON.stringify({ title: 'Retry', body: 'Not yet' }),
      channel: { id: 'channel-1', name: 'Desktop', kind: 'desktop' },
    })).toBeNull()
  })

  it('moves the cursor forward without moving it backward', () => {
    expect(advanceDesktopNotificationCursor('2026-08-30T00:00:02.000Z', { createdAt: '2026-08-30T00:00:03.000Z' })).toBe('2026-08-30T00:00:03.000Z')
    expect(advanceDesktopNotificationCursor('2026-08-30T00:00:03.000Z', { createdAt: '2026-08-30T00:00:02.000Z' })).toBe('2026-08-30T00:00:03.000Z')
  })
})
