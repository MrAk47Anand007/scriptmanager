

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, History, Loader2, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { loadWorkspaceAccessRuntime } from '@/lib/workspacesRuntimeClient'

type PermissionEntry = string | { permission: string }
type Role = { id: string; key: string; name: string; permissions: PermissionEntry[] }
type Member = { id: string; status: string; user: { id: string; name: string; email: string }; role: Role }
type WorkspaceData = { workspace: { name: string; kind?: string }; members: Member[]; roles: Role[]; invitations: { id: string; email: string; role: Role }[]; permissions: string[] }
type Session = { id: string; userAgent?: string; lastSeenAt: string; revokedAt?: string; user: { name: string } }
type AuditEvent = { id: string; type: string; actorName?: string; actorId: string; occurredAt: string }

function permissionLabel(entry: PermissionEntry) {
  return typeof entry === 'string' ? entry : entry.permission
}

export const WorkspaceAccessSection = () => {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const load = useCallback(async () => {
    setError('')
    try {
      const next = await loadWorkspaceAccessRuntime(); setData(next)
      setSessions(next.sessions ?? [])
      setAudit(next.audit ?? [])
    } catch (error) { setError(error instanceof Error && error.message.includes('denied') ? 'Your role cannot view workspace administration.' : 'Could not load workspace access.') }
  }, [])
  useEffect(() => { void load() }, [load])
  const isLocalOwner = data?.workspace.kind === 'local-owner'

  if (!data && !error) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading workspace access…</div>
  return <section className="space-y-6">
    <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Workspace access</h2><p className="text-muted-foreground">Members, roles, sessions, grants, and audit authority for {data?.workspace.name ?? 'this workspace'}.</p></div><Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    {error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</p>}
    {isLocalOwner && <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Local owner mode</CardTitle><CardDescription>This Tauri workspace is single-user. Invitations, custom roles, sessions, and remote grant revocation are retired in the local desktop app.</CardDescription></CardHeader></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Members and roles</CardTitle></CardHeader><CardContent className="space-y-2">{data?.members.map((member) => <div key={member.id} className="flex items-center justify-between rounded border border-wb-border p-3"><div><p className="font-medium">{member.user.name}</p><p className="text-xs text-muted-foreground">{member.user.email}</p></div><span className="rounded bg-muted px-2 py-1 text-xs">{member.role.name}</span></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Role permissions</CardTitle><CardDescription>Desktop access is local-owner only; these roles are shown for compatibility with imported workspace data.</CardDescription></CardHeader><CardContent className="space-y-3">{data?.roles.map((role) => <div key={role.id}><p className="font-medium">{role.name}</p><p className="text-xs text-muted-foreground">{role.permissions.map(permissionLabel).join(', ') || 'No permissions'}</p></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />Sessions and grant revocation</CardTitle></CardHeader><CardContent className="space-y-2">{sessions.length ? sessions.map((session) => <div key={session.id} className="rounded border border-wb-border p-3"><p className="font-medium">{session.user.name}</p><p className="text-xs text-muted-foreground">{session.userAgent || 'Unknown client'} · last seen {new Date(session.lastSeenAt).toLocaleString()} {session.revokedAt ? '· revoked' : ''}</p></div>) : <p className="text-sm text-muted-foreground">No visible sessions.</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Workspace audit</CardTitle></CardHeader><CardContent className="space-y-2">{audit.length ? audit.slice(0, 20).map((event) => <div key={event.id} className="flex justify-between border-b border-wb-border py-2 text-xs"><span>{event.type} · {event.actorName ?? event.actorId}</span><span className="text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</span></div>) : <p className="text-sm text-muted-foreground">No workspace administration events recorded yet.</p>}</CardContent></Card>
  </section>
}
