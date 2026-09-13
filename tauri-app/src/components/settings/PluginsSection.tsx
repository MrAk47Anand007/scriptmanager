

import React, { useEffect, useState } from 'react'
import { LoaderCircle, Play } from 'lucide-react'
import { listPluginsRuntime, removePluginRuntime, updatePluginRuntime } from '@/lib/pluginsRuntimeClient'
import {
  getPluginSourceRuntime,
  runPluginRuntime,
  savePluginSourceRuntime,
} from '@/lib/pluginsRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

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
  const [sourceFor, setSourceFor] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [sourceDirty, setSourceDirty] = useState(false)
  const [runInput, setRunInput] = useState('{}')
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
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
  const openSource = async (id: string) => {
    setSourceFor(id)
    try {
      setSource(await getPluginSourceRuntime(id))
      setSourceDirty(false)
      setRunOutput(null)
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load plugin source'))
    }
  }
  const saveSource = async (id: string) => {
    try {
      await savePluginSourceRuntime(id, source)
      setSourceDirty(false)
      toast.success('Plugin source saved')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save plugin source'))
    }
  }
  const run = async (id: string) => {
    setRunning(true)
    setRunOutput(null)
    try {
      let input: unknown = {}
      try { input = runInput.trim() ? JSON.parse(runInput) : {} } catch { throw new Error('Run input must be valid JSON') }
      const output = await runPluginRuntime({ pluginId: id, input })
      setRunOutput(JSON.stringify(output, null, 2))
    } catch (error) {
      toast.error(getOperationError(error, 'Plugin run failed'))
    } finally {
      setRunning(false)
    }
  }
  return <section className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Plugins</h2>
      <p className="text-muted-foreground">
        Plugins run in a boa JS sandbox: no filesystem, no processes, no timers.
        Grant <code className="font-mono text-[11px]">storage</code> in the manifest for a plugin-scoped key/value store. Execution only happens when you click Run.
      </p>
    </div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {plugins.length === 0 ? <p className="rounded border border-dashed p-4 text-muted-foreground">No plugins installed.</p> : plugins.map((plugin) => {
      const manifestName = plugin.manifest.name ?? plugin.name
      const manifestId = plugin.manifest.id ?? plugin.id
      const manifestVersion = plugin.manifest.version ?? plugin.version
      const capabilities = plugin.manifest.capabilities ?? plugin.manifest.permissions ?? []
      const isOpen = sourceFor === plugin.id
      return <article key={plugin.id} className="rounded border border-wb-border p-4 space-y-2">
        <div className="flex justify-between">
          <div>
            <h3 className="font-medium">{manifestName}</h3>
            <p className="text-xs text-muted-foreground">{manifestId} · v{manifestVersion}</p>
          </div>
          <span>{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <p className="text-xs">Declared capabilities: {capabilities.join(', ') || 'none'}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => action(plugin.id, plugin.enabled ? 'disable' : 'enable')}>{plugin.enabled ? 'Disable' : 'Enable'}</button>
          <button onClick={() => { if (isOpen) { setSourceFor(null); return } setSourceFor(plugin.id); void openSource(plugin.id) }}>
            {isOpen ? 'Hide source' : 'Source & run'}
          </button>
          <button className="text-red-500" onClick={() => remove(plugin.id)}>Uninstall</button>
        </div>
        {isOpen && (
          <div className="space-y-2 border-t border-wb-border pt-2">
            <textarea
              value={source}
              onChange={(event) => { setSource(event.target.value); setSourceDirty(true) }}
              spellCheck={false}
              placeholder="function setResult(v) {} available — set `result`, use log(...), storage.get/set if granted."
              className="h-40 w-full resize-none rounded-md border border-wb-border bg-background p-2 font-mono text-[11px] outline-none focus:border-accent-brand"
            />
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                className="h-7 gap-1 text-[11px]"
                disabled={!sourceDirty}
                onClick={() => void saveSource(plugin.id)}
              >
                Save source
              </Button>
              <Button
                className="h-7 gap-1 text-[11px]"
                disabled={running || !plugin.enabled}
                onClick={() => void run(plugin.id)}
                title={plugin.enabled ? undefined : 'Enable the plugin to run it'}
              >
                {running ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Run
              </Button>
              <input
                value={runInput}
                onChange={(event) => setRunInput(event.target.value)}
                placeholder='{"count": 21}'
                spellCheck={false}
                className="h-7 flex-1 rounded-md border border-wb-border bg-background px-2 font-mono text-[10px] outline-none focus:border-accent-brand"
              />
            </div>
            {runOutput && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-wb-border bg-background p-2 font-mono text-[10px] text-muted-foreground">
                {runOutput}
              </pre>
            )}
          </div>
        )}
      </article>
    })}
  </section>
}
