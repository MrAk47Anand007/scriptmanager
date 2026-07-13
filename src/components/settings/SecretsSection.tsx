'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, RefreshCw, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SecretMetadata = { id: string; name: string; description: string; scope: string; status: string; currentVersion: number; updatedAt: string; _count: { bindings: number; accessEvents: number } }

export function SecretsSection() {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([])
  const [name, setName] = useState('')
  const [plaintext, setPlaintext] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => setSecrets(await (await fetch('/api/secrets?workspaceId=default')).json()), [])
  useEffect(() => { void load() }, [load])

  async function createSecret() {
    if (!name || !plaintext) return
    setBusy(true)
    await fetch('/api/secrets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, plaintext, workspaceId: 'default' }) })
    setName(''); setPlaintext(''); await load(); setBusy(false)
  }

  async function rotate(secret: SecretMetadata) {
    const value = window.prompt(`New value for ${secret.name}`)
    if (!value) return
    await fetch(`/api/secrets/${secret.id}/rotate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plaintext: value, resource: '*', reason: 'settings rotation' }) })
    await load()
  }

  async function disable(secret: SecretMetadata) {
    await fetch(`/api/secrets/${secret.id}/disable`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resource: '*', reason: 'settings disable' }) })
    await load()
  }

  return <section className="space-y-6">
    <div><h2 className="text-xl font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5" /> Secret vault</h2><p className="text-muted-foreground mt-1">Encrypted credentials shared by scripts, APIs, Ops, storage, workflows, and agents.</p></div>
    <div className="rounded-lg border p-4 space-y-3">
      <h3 className="font-medium">Add secret</h3>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="vault-name">Name</Label><Input id="vault-name" value={name} onChange={(event) => setName(event.target.value)} /></div><div><Label htmlFor="vault-value">Value</Label><Input id="vault-value" type="password" value={plaintext} onChange={(event) => setPlaintext(event.target.value)} /></div></div>
      <Button onClick={createSecret} disabled={busy || !name || !plaintext}><Plus className="h-4 w-4 mr-2" />Store encrypted</Button>
    </div>
    <div className="space-y-2">{secrets.map((secret) => <div key={secret.id} className="rounded-lg border p-4 flex items-center justify-between gap-4"><div><div className="font-medium">{secret.name}</div><div className="text-xs text-muted-foreground">{secret.scope} · version {secret.currentVersion} · {secret._count.bindings} usages · {secret._count.accessEvents} access events · {secret.status}</div></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => rotate(secret)} disabled={secret.status !== 'active'}><RefreshCw className="h-3.5 w-3.5 mr-1" />Rotate</Button><Button size="sm" variant="outline" onClick={() => disable(secret)} disabled={secret.status !== 'active'}><ShieldOff className="h-3.5 w-3.5 mr-1" />Disable</Button></div></div>)}</div>
  </section>
}
