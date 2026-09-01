

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  createNotificationChannelRuntime,
  createNotificationRuleRuntime,
  listNotificationChannelsRuntime,
  listNotificationDeliveriesRuntime,
  listNotificationRulesRuntime,
  type NotificationChannel,
  type NotificationDelivery,
  type NotificationRule,
} from '@/lib/notificationsRuntimeClient'

const channelKinds = ['desktop', 'webhook', 'slack', 'smtp', 'teams'] as const

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
}

export function NotificationsSection() {
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([])
  const [channelName, setChannelName] = useState('Desktop alerts')
  const [channelKind, setChannelKind] = useState<(typeof channelKinds)[number]>('desktop')
  const [channelConfigJson, setChannelConfigJson] = useState('{}')
  const [ruleName, setRuleName] = useState('Execution failures')
  const [ruleChannelId, setRuleChannelId] = useState('')
  const [eventTypes, setEventTypes] = useState('execution.failed')
  const [filterJson, setFilterJson] = useState('{}')
  const [templateJson, setTemplateJson] = useState('{"title":"ScriptManager event","body":"{{target}} failed"}')
  const [throttleSeconds, setThrottleSeconds] = useState('0')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'channel' | 'rule' | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextChannels, nextRules, nextDeliveries] = await Promise.all([
        listNotificationChannelsRuntime(),
        listNotificationRulesRuntime(),
        listNotificationDeliveriesRuntime(),
      ])
      setChannels(nextChannels)
      setRules(nextRules)
      setDeliveries(nextDeliveries)
      setRuleChannelId((current) => current || nextChannels[0]?.id || '')
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to load notification settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function addChannel() {
    if (!channelName.trim()) {
      setError('Channel name is required')
      return
    }
    setBusy('channel')
    setError('')
    try {
      const created = await createNotificationChannelRuntime({ name: channelName, kind: channelKind, config: parseJson(channelConfigJson, 'Channel configuration') })
      setChannelName('')
      setRuleChannelId((current) => current || created.id)
      await load()
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to create notification channel')
    } finally {
      setBusy(null)
    }
  }

  async function addRule() {
    if (!ruleChannelId) {
      setError('Create or select a notification channel first')
      return
    }
    if (!ruleName.trim() || !eventTypes.trim()) {
      setError('Rule name and event types are required')
      return
    }
    setBusy('rule')
    setError('')
    try {
      await createNotificationRuleRuntime({
        channelId: ruleChannelId,
        name: ruleName,
        eventTypes,
        filter: parseJson(filterJson, 'Filter'),
        template: parseJson(templateJson, 'Template'),
        throttleSeconds: Math.max(0, Math.min(Number(throttleSeconds) || 0, 86400)),
      })
      await load()
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to create notification rule')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">Configure workspace-scoped channels, event rules, and delivery history. Secrets stay in the vault.</p>
      </div>

      {error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery channels</CardTitle>
          <CardDescription>Desktop alerts work locally. Remote providers use their stored configuration when a matching event is dispatched.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input aria-label="Channel name" value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="Channel name" />
            <select aria-label="Channel type" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={channelKind} onChange={(event) => setChannelKind(event.target.value as (typeof channelKinds)[number])}>
              {channelKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <Button type="button" onClick={() => void addChannel()} disabled={busy !== null}>{busy === 'channel' ? 'Adding...' : 'Add channel'}</Button>
          </div>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">Channel configuration JSON<textarea aria-label="Channel configuration JSON" value={channelConfigJson} onChange={(event) => setChannelConfigJson(event.target.value)} className="min-h-16 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder='{"url":"https://example.test/hook"}' /></label>
          <div className="divide-y rounded-md border">
            {channels.map((channel) => (
              <div key={channel.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="font-medium">{channel.name} <span className="ml-1 text-xs font-normal text-muted-foreground">{channel.kind}</span></span>
                <span className="text-xs text-muted-foreground">{channel._count?.rules ?? 0} rules - {channel._count?.deliveries ?? 0} deliveries</span>
              </div>
            ))}
            {!loading && channels.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">No channels configured.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event rules</CardTitle>
          <CardDescription>Match comma-separated event types, for example <code>execution.failed,workflow.failed</code>. Use <code>*</code> for all events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Rule name" value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Rule name" />
            <select aria-label="Rule channel" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ruleChannelId} onChange={(event) => setRuleChannelId(event.target.value)} disabled={!channels.length}>
              {!channels.length && <option value="">No channels available</option>}
              {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} ({channel.kind})</option>)}
            </select>
            <Input aria-label="Event types" value={eventTypes} onChange={(event) => setEventTypes(event.target.value)} placeholder="execution.failed" />
            <Input aria-label="Throttle seconds" type="number" min="0" max="86400" value={throttleSeconds} onChange={(event) => setThrottleSeconds(event.target.value)} placeholder="Throttle seconds" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Filter JSON<textarea aria-label="Filter JSON" value={filterJson} onChange={(event) => setFilterJson(event.target.value)} className="min-h-20 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Template JSON<textarea aria-label="Template JSON" value={templateJson} onChange={(event) => setTemplateJson(event.target.value)} className="min-h-20 rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          </div>
          <Button type="button" onClick={() => void addRule()} disabled={busy !== null || !channels.length}>{busy === 'rule' ? 'Adding...' : 'Add rule'}</Button>
          <div className="divide-y rounded-md border">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div><span className="font-medium">{rule.name}</span><p className="text-xs text-muted-foreground">{rule.eventTypes} -&gt; {rule.channel?.name ?? 'Unknown channel'}</p></div>
                <span className="text-xs text-muted-foreground">{rule.enabled ? 'Enabled' : 'Disabled'}{rule.throttleSeconds ? ` - ${rule.throttleSeconds}s throttle` : ''}</span>
              </div>
            ))}
            {!loading && rules.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">No rules configured.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent deliveries</CardTitle>
          <CardDescription>The latest 100 workspace deliveries, including retries and failures.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {deliveries.map((delivery) => (
              <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div><span className="font-medium">{delivery.rule?.name ?? 'Unlinked rule'}</span><p className="text-xs text-muted-foreground">{delivery.channel?.name ?? 'Unknown channel'} - {formatDate(delivery.createdAt)}</p></div>
                <span className="rounded bg-muted px-2 py-1 text-xs uppercase">{delivery.status} - attempt {delivery.attemptCount}</span>
              </div>
            ))}
            {!loading && deliveries.length === 0 && <p className="px-3 py-5 text-sm text-muted-foreground">No notification deliveries yet.</p>}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
