export type NotificationChannelKind = 'desktop' | 'webhook' | 'slack' | 'smtp' | 'teams'

export interface NotificationMessage { title: string; body: string; deepLink?: string; data?: Record<string, unknown> }
