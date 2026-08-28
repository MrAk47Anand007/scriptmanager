'use client'

import React, { useEffect, useState } from 'react'
import { listPluginsRuntime, removePluginRuntime, updatePluginRuntime } from '@/lib/pluginsRuntimeClient'

type PluginView = { id: string; enabled: boolean; trusted: boolean; allowUnsigned: boolean; signatureValid: boolean; health: { status: string; message?: string }; manifest: { id: string; name: string; version: string; capabilities: string[] } }

export function PluginsSection() {
  const [plugins, setPlugins] = useState<PluginView[]>([]); const [error, setError] = useState('')
  const load = async () => { try { setPlugins(await listPluginsRuntime()) } catch { setError('Unable to load plugins') } }
  useEffect(() => { void load() }, [])
  const action = async (id: string, value: string) => { try { await updatePluginRuntime(id, value); setError('') } catch (error) { setError(error instanceof Error ? error.message : 'Plugin update failed') }; await load() }
  const remove = async (id: string) => { if (!confirm('Uninstall this plugin from the workspace?')) return; await removePluginRuntime(id); await load() }
  return <section className="space-y-4"><div><h2 className="text-lg font-semibold">Plugins</h2><p className="text-muted-foreground">Trusted local integrations and workflow nodes. Unsigned development packages are clearly marked.</p></div>{error && <p role="alert" className="text-red-500">{error}</p>}{plugins.length === 0 ? <p className="rounded border border-dashed p-4 text-muted-foreground">No plugins installed.</p> : plugins.map((plugin) => <article key={plugin.id} className="rounded border border-wb-border p-4 space-y-2"><div className="flex justify-between"><div><h3 className="font-medium">{plugin.manifest.name}</h3><p className="text-xs text-muted-foreground">{plugin.manifest.id} · v{plugin.manifest.version}</p></div><span>{plugin.enabled ? 'Enabled' : 'Disabled'}</span></div>{plugin.allowUnsigned && !plugin.signatureValid && <p className="text-amber-500">Unsigned local-development package</p>}<p>Health: {plugin.health.status}{plugin.health.message ? ` — ${plugin.health.message}` : ''}</p><p className="text-xs">Capabilities: {plugin.manifest.capabilities.join(', ') || 'none'}</p><div className="flex gap-2">{!plugin.trusted && <button onClick={() => action(plugin.id, 'trust')}>Trust</button>}<button disabled={!plugin.trusted} onClick={() => action(plugin.id, plugin.enabled ? 'disable' : 'enable')}>{plugin.enabled ? 'Disable' : 'Enable'}</button><button onClick={() => action(plugin.id, 'health')}>Check health</button><button className="text-red-500" onClick={() => remove(plugin.id)}>Uninstall</button></div></article>)}</section>
}
