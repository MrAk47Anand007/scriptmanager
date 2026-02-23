'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateDraft, saveApiRequest, sendApiRequest } from '@/features/api/apiSlice'
import type { ApiRequestDraft, KeyValueRow } from '@/features/api/apiSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KeyValueTable } from './KeyValueTable'
import { MethodBadge } from './MethodBadge'
import { Loader2, Save, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false })

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const COMMON_HEADERS = [
  'Content-Type', 'Authorization', 'Accept', 'Accept-Language',
  'Cache-Control', 'Cookie', 'User-Agent', 'Referer', 'Origin',
  'X-Requested-With', 'X-API-Key', 'X-Auth-Token'
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrlFromParts(baseUrl: string, enabledParams: KeyValueRow[]): string {
  if (!baseUrl) return ''
  try {
    const hasProto = /^https?:\/\//i.test(baseUrl)
    const fullUrl = hasProto ? baseUrl : `https://${baseUrl}`
    const parsed = new URL(fullUrl)
    // Replace existing search params with enabled ones
    parsed.search = ''
    enabledParams.forEach(p => {
      if (p.key) parsed.searchParams.append(p.key, p.value)
    })
    return hasProto ? parsed.toString() : parsed.toString().replace(/^https:\/\//, '')
  } catch {
    return baseUrl
  }
}

function parseQueryFromUrl(url: string): KeyValueRow[] {
  try {
    const hasProto = /^https?:\/\//i.test(url)
    const fullUrl = hasProto ? url : `https://${url}`
    const parsed = new URL(fullUrl)
    const rows: KeyValueRow[] = []
    parsed.searchParams.forEach((value, key) => {
      rows.push({ id: crypto.randomUUID(), key, value, enabled: true })
    })
    return rows
  } catch {
    return []
  }
}

function stripQuery(url: string): string {
  try {
    const hasProto = /^https?:\/\//i.test(url)
    const fullUrl = hasProto ? url : `https://${url}`
    const parsed = new URL(fullUrl)
    parsed.search = ''
    return hasProto ? parsed.toString() : parsed.toString().replace(/^https:\/\//, '')
  } catch {
    const qIdx = url.indexOf('?')
    return qIdx !== -1 ? url.slice(0, qIdx) : url
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApiRequestEditor() {
  const dispatch = useAppDispatch()
  const { activeRequest, isSending } = useAppSelector(s => s.api)
  const { resolvedTheme } = useTheme()
  const [editingName, setEditingName] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  // Sync urlInput when activeRequest changes
  useEffect(() => {
    if (activeRequest) {
      setUrlInput(activeRequest.url)
    }
  }, [activeRequest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const draft = activeRequest

  const update = useCallback((partial: Partial<ApiRequestDraft>) => {
    dispatch(updateDraft(partial))
  }, [dispatch])

  if (!draft) return null

  const handleUrlChange = (value: string) => {
    setUrlInput(value)
    const parsedParams = parseQueryFromUrl(value)
    const baseUrl = stripQuery(value)

    if (parsedParams.length > 0) {
      // URL has query string: update both url and queryParams
      update({ url: value, queryParams: [...parsedParams, { id: crypto.randomUUID(), key: '', value: '', enabled: true }] })
    } else {
      update({ url: baseUrl })
    }
  }

  const handleParamsChange = (rows: KeyValueRow[]) => {
    const enabled = rows.filter(r => r.enabled && r.key)
    const newUrl = buildUrlFromParts(stripQuery(draft.url), enabled)
    setUrlInput(newUrl)
    update({ queryParams: rows, url: newUrl })
  }

  const handleSend = async () => {
    await dispatch(sendApiRequest(draft))
    // Refresh history after send
  }

  const handleSave = async () => {
    const result = await dispatch(saveApiRequest(draft))
    if (saveApiRequest.fulfilled.match(result)) {
      // successfully saved
    }
  }

  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-950">
      {/* Request name */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        {editingName ? (
          <Input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
            autoFocus
            className="h-6 text-sm font-medium py-0 px-1 w-full max-w-sm"
          />
        ) : (
          <span
            className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-text hover:text-slate-900 dark:hover:text-slate-100"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {draft.name}
          </span>
        )}
      </div>

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 pb-2 shrink-0">
        <Select value={draft.method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger className="w-28 h-8 text-xs font-mono shrink-0">
            <SelectValue>
              <MethodBadge method={draft.method} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {METHODS.map(m => (
              <SelectItem key={m} value={m} className="text-xs font-mono">
                <MethodBadge method={m} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={urlInput}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://api.example.com/endpoint"
          className="h-8 text-sm font-mono flex-1 min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />

        <Button
          onClick={handleSend}
          disabled={isSending || !draft.url}
          className="h-8 px-3 text-xs shrink-0 gap-1.5"
        >
          {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </Button>

        <Button
          variant="outline"
          onClick={handleSave}
          className="h-8 px-3 text-xs shrink-0 gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-slate-100 dark:border-slate-800">
        <Tabs defaultValue="params" className="h-full flex flex-col">
          <TabsList className="h-8 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0">
            <TabsTrigger value="params" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Params
              {draft.queryParams.filter(p => p.enabled && p.key).length > 0 && (
                <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded px-1">
                  {draft.queryParams.filter(p => p.enabled && p.key).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Headers
              {draft.headers.filter(h => h.enabled && h.key).length > 0 && (
                <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded px-1">
                  {draft.headers.filter(h => h.enabled && h.key).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="body" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Body
              {draft.bodyType !== 'none' && (
                <span className="ml-1 text-[10px] bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded px-1">
                  {draft.bodyType}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="auth" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Auth
              {draft.authType !== 'none' && (
                <span className="ml-1 text-[10px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 rounded px-1">
                  {draft.authType}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Params tab */}
          <TabsContent value="params" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.queryParams}
              onChange={handleParamsChange}
              keyPlaceholder="param"
              valuePlaceholder="value"
            />
          </TabsContent>

          {/* Headers tab */}
          <TabsContent value="headers" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.headers}
              onChange={(rows) => update({ headers: rows })}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
            />
            <div className="mt-2">
              <p className="text-[11px] text-slate-400 mb-1">Common headers:</p>
              <div className="flex flex-wrap gap-1">
                {COMMON_HEADERS.map(h => (
                  <button
                    key={h}
                    onClick={() => {
                      const existing = draft.headers.find(r => r.key === h)
                      if (!existing) {
                        update({
                          headers: [...draft.headers, { id: crypto.randomUUID(), key: h, value: '', enabled: true }]
                        })
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Body tab */}
          <TabsContent value="body" className="flex-1 flex flex-col overflow-hidden p-0 m-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-xs text-slate-500">Body type:</span>
              <Select value={draft.bodyType} onValueChange={(v) => update({ bodyType: v as ApiRequestDraft['bodyType'] })}>
                <SelectTrigger className="w-32 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  <SelectItem value="json" className="text-xs">JSON</SelectItem>
                  <SelectItem value="form" className="text-xs">Form</SelectItem>
                  <SelectItem value="raw" className="text-xs">Raw</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {draft.bodyType === 'none' && (
                <div className="flex items-center justify-center h-full text-xs text-slate-400">
                  No body
                </div>
              )}

              {(draft.bodyType === 'json' || draft.bodyType === 'raw') && (
                <MonacoEditor
                  height="100%"
                  language={draft.bodyType === 'json' ? 'json' : 'plaintext'}
                  value={draft.body}
                  onChange={(v) => update({ body: v ?? '' })}
                  theme={editorTheme}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: 'on',
                    automaticLayout: true,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2
                  }}
                />
              )}

              {draft.bodyType === 'form' && (
                <div className="p-3 overflow-y-auto h-full">
                  <KeyValueTable
                    rows={(() => {
                      try { return JSON.parse(draft.body) as KeyValueRow[] } catch { return [] }
                    })()}
                    onChange={(rows) => update({ body: JSON.stringify(rows) })}
                    keyPlaceholder="field"
                    valuePlaceholder="value"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* Auth tab */}
          <TabsContent value="auth" className="flex-1 overflow-y-auto p-3 m-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-slate-500 shrink-0">Auth type:</span>
              <Select value={draft.authType} onValueChange={(v) => update({ authType: v as ApiRequestDraft['authType'], authConfig: {} })}>
                <SelectTrigger className="w-36 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  <SelectItem value="bearer" className="text-xs">Bearer Token</SelectItem>
                  <SelectItem value="basic" className="text-xs">Basic Auth</SelectItem>
                  <SelectItem value="apikey" className="text-xs">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.authType === 'bearer' && (
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Token</label>
                <Input
                  value={draft.authConfig.token ?? ''}
                  onChange={(e) => update({ authConfig: { ...draft.authConfig, token: e.target.value } })}
                  placeholder="Enter bearer token"
                  className="h-8 text-xs font-mono"
                />
              </div>
            )}

            {draft.authType === 'basic' && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Username</label>
                  <Input
                    value={draft.authConfig.username ?? ''}
                    onChange={(e) => update({ authConfig: { ...draft.authConfig, username: e.target.value } })}
                    placeholder="Username"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Password</label>
                  <Input
                    type="password"
                    value={draft.authConfig.password ?? ''}
                    onChange={(e) => update({ authConfig: { ...draft.authConfig, password: e.target.value } })}
                    placeholder="Password"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {draft.authType === 'apikey' && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Key Name</label>
                  <Input
                    value={draft.authConfig.keyName ?? ''}
                    onChange={(e) => update({ authConfig: { ...draft.authConfig, keyName: e.target.value } })}
                    placeholder="X-API-Key"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Key Value</label>
                  <Input
                    value={draft.authConfig.keyValue ?? ''}
                    onChange={(e) => update({ authConfig: { ...draft.authConfig, keyValue: e.target.value } })}
                    placeholder="Your API key"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Add to</label>
                  <Select
                    value={draft.authConfig.keyLocation ?? 'header'}
                    onValueChange={(v) => update({ authConfig: { ...draft.authConfig, keyLocation: v } })}
                  >
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="header" className="text-xs">Header</SelectItem>
                      <SelectItem value="query" className="text-xs">Query Param</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {draft.authType === 'none' && (
              <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                No authentication
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
