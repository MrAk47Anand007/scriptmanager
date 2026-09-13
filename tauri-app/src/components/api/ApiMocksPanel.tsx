import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Plus, Play, RefreshCw, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  clearMockRequestsRuntime,
  deleteMockServerRuntime,
  listMockRequestsRuntime,
  listMockServersRuntime,
  saveMockServerRuntime,
  startMockServerRuntime,
  stopMockServerRuntime,
  type MockRequestRecordRuntime,
  type MockRouteRuntime,
  type MockServerRuntime,
} from '@/lib/mockRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type RouteRow = MockRouteRuntime

function emptyRoute(): RouteRow {
  return { method: 'GET', path: '/api/hello', status: 200, headers: {}, body: '{"ok": true}', delayMs: 0, matchMode: 'exact', enabled: true }
}

/**
 * Mocks tab: manage local mock servers (canned HTTP responses), start/stop
 * them, and inspect incoming requests. Editing routes while a server runs
 * restarts it automatically so the new routes apply.
 */
export function ApiMocksPanel() {
  const [servers, setServers] = useState<Array<MockServerRuntime & { running: boolean; port?: number | null }>>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [requests, setRequests] = useState<MockRequestRecordRuntime[]>([])
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listMockServersRuntime()
      setServers(list)
      const current = list.find((server) => server.id === selectedId) ?? list[0] ?? null
      if (current) {
        setSelectedId(current.id)
        setRoutes(current.routes)
        setRequests(await listMockRequestsRuntime(current.id))
        setDirty(false)
      } else {
        setSelectedId(null)
        setRoutes([])
        setRequests([])
      }
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to load mock servers'))
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = servers.find((server) => server.id === selectedId) ?? null

  const select = async (id: string) => {
    setSelectedId(id)
    const server = servers.find((item) => item.id === id)
    setRoutes(server?.routes ?? [])
    setDirty(false)
    try {
      setRequests(await listMockRequestsRuntime(id))
    } catch {
      setRequests([])
    }
  }

  const createServer = async () => {
    try {
      const created = await saveMockServerRuntime({ name: `Mock server ${servers.length + 1}`, port: 0, enabled: true, routes: [emptyRoute()] })
      await load()
      setSelectedId(created.id)
      setRoutes(created.routes)
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to create mock server'))
    }
  }

  const persistRoutes = async () => {
    if (!selected) return
    try {
      await saveMockServerRuntime({ id: selected.id, name: selected.name, port: selected.port, enabled: true, routes })
      setDirty(false)
      toast.success('Routes saved' + (selected.running ? ' — server restarted with new routes' : ''))
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save routes'))
    }
  }

  const toggleRunning = async (server: MockServerRuntime & { running: boolean; port?: number | null }) => {
    try {
      if (server.running) {
        await stopMockServerRuntime(server.id)
        toast.success('Mock server stopped')
      } else {
        const status = await startMockServerRuntime(server.id)
        toast.success(`Mock server running on port ${status.port}`)
      }
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to toggle mock server'))
    }
  }

  const removeServer = async (id: string) => {
    try {
      await deleteMockServerRuntime(id)
      toast.success('Mock server deleted')
      if (selectedId === id) setSelectedId(null)
      await load()
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to delete mock server'))
    }
  }

  const updateRoute = (index: number, patch: Partial<RouteRow>) => {
    setRoutes((current) => current.map((route, i) => (i === index ? { ...route, ...patch } : route)))
    setDirty(true)
  }

  const copyBase = (server: MockServerRuntime & { running: boolean; port?: number | null }) => {
    const url = `http://127.0.0.1:${server.port ?? server.port}`
    void navigator.clipboard.writeText(url)
    toast.success(`Copied ${url}`)
  }

  const inputClass = 'h-7 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-1.5 text-[11px] outline-none focus:border-blue-400'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mock servers</span>
        <div className="flex items-center gap-1">
          <button aria-label="Refresh" onClick={() => void load()} className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
          <button aria-label="New mock server" onClick={() => void createServer()} className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-2 space-y-1 shrink-0">
        {servers.length === 0 && (
          <p className="px-1 py-3 text-[11px] text-slate-400 italic">No mock servers yet — create one and point your tests at it.</p>
        )}
        {servers.map((server) => (
          <div
            key={server.id}
            onClick={() => void select(server.id)}
            className={cn(
              'group flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-xs',
              selectedId === server.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50'
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', server.running ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-700 dark:text-slate-200">{server.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {server.running ? `127.0.0.1:${server.port} · ${server.routes.filter((route) => route.enabled).length} routes` : 'stopped'}
              </div>
            </div>
            {server.running && (
              <button
                aria-label="Copy base URL"
                onClick={(event) => { event.stopPropagation(); copyBase(server) }}
                className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            <button
              aria-label={server.running ? 'Stop mock server' : 'Start mock server'}
              onClick={(event) => { event.stopPropagation(); void toggleRunning(server) }}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded',
                server.running ? 'text-amber-500 hover:bg-amber-500/10' : 'text-emerald-500 hover:bg-emerald-500/10'
              )}
            >
              {server.running ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button
              aria-label="Delete mock server"
              onClick={(event) => { event.stopPropagation(); void removeServer(server.id) }}
              className="rounded p-1 text-slate-400 hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200 dark:border-slate-800 mt-2">
          <div className="flex items-center justify-between px-3 py-1.5 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Routes {dirty && '· unsaved'}</span>
            <div className="flex gap-1">
              <Button variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => { setRoutes((current) => [...current, emptyRoute()]); setDirty(true) }}>
                <Plus className="h-3 w-3" /> Route
              </Button>
              <Button className="h-6 text-[10px] px-2 gap-1" disabled={!dirty} onClick={() => void persistRoutes()}>
                <Check className="h-3 w-3" /> Save
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1.5 pb-2">
            {routes.map((route, index) => (
              <div key={index} className="rounded-md border border-slate-200 dark:border-slate-800 p-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <select aria-label="Method" value={route.method} onChange={(event) => updateRoute(index, { method: event.target.value })} className={cn(inputClass, 'w-20 font-mono')}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => <option key={method}>{method}</option>)}
                  </select>
                  <input aria-label="Path" value={route.path} onChange={(event) => updateRoute(index, { path: event.target.value })} placeholder="/api/path" className={cn(inputClass, 'flex-1 font-mono')} />
                  <select aria-label="Match mode" value={route.matchMode} onChange={(event) => updateRoute(index, { matchMode: event.target.value as RouteRow["matchMode"] })} className={cn(inputClass, 'w-24')}>
                    <option value="exact">exact</option>
                    <option value="prefix">prefix</option>
                  </select>
                  <input aria-label="Status" type="number" value={route.status} onChange={(event) => updateRoute(index, { status: Number(event.target.value) || 200 })} className={cn(inputClass, 'w-16')} />
                  <button
                    aria-label="Remove route"
                    onClick={() => { setRoutes((current) => current.filter((_, i) => i !== index)); setDirty(true) }}
                    className="rounded p-1 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    aria-label="Response body"
                    value={route.body}
                    onChange={(event) => updateRoute(index, { body: event.target.value })}
                    placeholder='{"json": "response"}'
                    className={cn(inputClass, 'flex-1 font-mono')}
                  />
                  <input
                    aria-label="Delay ms"
                    type="number"
                    value={route.delayMs}
                    onChange={(event) => updateRoute(index, { delayMs: Number(event.target.value) || 0 })}
                    placeholder="delay ms"
                    className={cn(inputClass, 'w-20')}
                  />
                </div>
              </div>
            ))}
            {routes.length === 0 && <p className="text-[11px] text-slate-400 italic p-2">No routes — unmatched requests get a 404 JSON.</p>}
          </div>

          <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Incoming requests</span>
            <button
              aria-label="Clear request log"
              onClick={() => { if (selected) { void clearMockRequestsRuntime(selected.id).then(() => setRequests([])) } }}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-0.5">
            {requests.map((request) => (
              <div key={request.id} className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                <span className={cn('font-semibold', request.statusSent < 400 ? 'text-emerald-500' : 'text-red-500')}>{request.statusSent}</span>
                <span className="w-12 shrink-0">{request.method}</span>
                <span className="truncate flex-1">{request.path}</span>
                <span className="shrink-0">{new Date(request.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
            {requests.length === 0 && <p className="text-[11px] text-slate-400 italic p-1">No incoming requests yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
