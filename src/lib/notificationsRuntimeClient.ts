export async function listNotificationChannelsRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listNotificationChannels) {
    return window.scriptManagerDesktop.runtime.listNotificationChannels()
  }
  const response = await fetch('/api/notifications/channels')
  if (!response.ok) {
    throw new Error('Unable to load notification channels')
  }
  return response.json()
}

export async function createNotificationChannelRuntime(payload: { name: string; kind: string; config?: unknown }) {
  if (window.scriptManagerDesktop?.runtime?.createNotificationChannel) {
    return window.scriptManagerDesktop.runtime.createNotificationChannel(payload)
  }
  const response = await fetch('/api/notifications/channels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Unable to create notification channel')
  }
  return response.json()
}
