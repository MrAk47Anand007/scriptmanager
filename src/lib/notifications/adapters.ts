import type { NotificationMessage } from './types'

export interface NotificationAdapter { send(config: Record<string, unknown>, message: NotificationMessage): Promise<void> }

async function post(url: unknown, body: unknown) {
  if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('A secure webhook URL is required')
  const response = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`)
}

export const notificationAdapters: Record<string, NotificationAdapter> = {
  webhook: { send: (config, message) => post(config.url, message) },
  slack: { send: (config, message) => post(config.url, { text:`*${message.title}*\n${message.body}${message.deepLink ? `\n${message.deepLink}` : ''}` }) },
  teams: { send: (config, message) => post(config.url, { type:'message', attachments:[{contentType:'application/vnd.microsoft.card.adaptive',content:{type:'AdaptiveCard',version:'1.4',body:[{type:'TextBlock',weight:'Bolder',text:message.title},{type:'TextBlock',wrap:true,text:message.body}]}}] }) },
  desktop: { send: async (_config, message) => { const notify = (globalThis as typeof globalThis & { scriptManagerNotify?: (message: NotificationMessage) => Promise<void> }).scriptManagerNotify; if (!notify) throw new Error('Desktop host is unavailable'); await notify(message) } },
  smtp: { send: async (config, message) => { const send = (globalThis as typeof globalThis & { scriptManagerSendMail?: (config:Record<string,unknown>, message:NotificationMessage)=>Promise<void> }).scriptManagerSendMail; if (!send) throw new Error('SMTP transport is unavailable'); await send(config, message) } },
}
