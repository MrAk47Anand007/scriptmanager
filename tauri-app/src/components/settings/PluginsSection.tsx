

import React, { useEffect, useState } from 'react'
import { listPluginsRuntime, removePluginRuntime, updatePluginRuntime } from '@/lib/pluginsRuntimeClient'

type PluginView = {
  id: string
  name: string
  version: string
  enabled: boolean
  manifest: { id?: string; name?: string; version?: string; capabilities?: string[]; permissions?: string[] }
}

export function PluginsSection() {
  const [plugins, setPlugins] = useState<PluginView[]>([])
  const [error, setError] = useState('')
  const load = async () => {
    try {
      setPlugins(await listPluginsRuntime())
    } catch {
      setError('Unable to load plugins')
    }
  }
  useEffect(() => { void load() }, [])
  const action = async (id: string, value: 'enable' | 'disable') => {
    try {
      await updatePluginRuntime(id, value)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Plugin update failed')
    }
    await load()
  }
  const remove = async (id: string) => {
    if (!confirm('Uninstall this plugin from the workspace?')) return
    try { await removePluginRuntime(id); setError(''); await load() } catch (error) { setError(error instanceof Error ? error.message : 'Plugin uninstall failed') }
  }
  return <section className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Plugins</h2>
      <p className="text-muted-foreground">Plugin metadata can be installed and managed locally. Plugin execution, health checks, and workflow nodes are migration-pending in the Tauri build.</p>
    </div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {plugins.length === 0 ? <p className="rounded border border-dashed p-4 text-muted-foreground">No plugins installed.</p> : plugins.map((plugin) => {
      const manifestName = plugin.manifest.name ?? plugin.name
      const manifestId = plugin.manifest.id ?? plugin.id
      const manifestVersion = plugin.manifest.version ?? plugin.version
      const capabilities = plugin.manifest.capabilities ?? plugin.manifest.permissions ?? []
      return <article key={plugin.id} className="rounded border border-wb-border p-4 space-y-2">
        <div className="flex justify-between">
          <div>
            <h3 className="font-medium">{manifestName}</h3>
            <p className="text-xs text-muted-foreground">{manifestId} · v{manifestVersion}</p>
          </div>
          <span>{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <p className="text-xs text-muted-foreground">Execution host disabled until Tauri plugin capability boundaries are ported.</p>
        <p className="text-xs">Declared capabilities: {capabilities.join(', ') || 'none'}</p>
        <div className="flex gap-2">
          <button onClick={() => action(plugin.id, plugin.enabled ? 'disable' : 'enable')}>{plugin.enabled ? 'Disable' : 'Enable'}</button>
          <button className="text-red-500" onClick={() => remove(plugin.id)}>Uninstall</button>
        </div>
      </article>
    })}
  </section>
}
