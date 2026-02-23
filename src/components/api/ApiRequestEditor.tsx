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
import { Loader2, Save, Play, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false })

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const COMMON_HEADERS = [
  'Content-Type', 'Authorization', 'Accept', 'Accept-Language',
  'Cache-Control', 'Cookie', 'User-Agent', 'X-Requested-With',
  'X-API-Key', 'X-Auth-Token', 'Origin', 'Referer'
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrlFromParts(baseUrl: string, enabledParams: KeyValueRow[]): string {
  if (!baseUrl) return ''
  try {
    const hasProto = /^https?:\/\//i.test(baseUrl)
    const fullUrl = hasProto ? baseUrl : `https://${baseUrl}`
    const parsed = new URL(fullUrl)
    parsed.search = ''
    enabledParams.forEach(p => { if (p.key) parsed.searchParams.append(p.key, p.value) })
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

// ─── Pill Toggle ──────────────────────────────────────────────────────────────

interface PillToggleOption<T extends string> {
  value: T
  label: string
}

interface PillToggleProps<T extends string> {
  options: PillToggleOption<T>[]
  value: T
  onChange: (v: T) => void
}

function PillToggle<T extends string>({ options, value, onChange }: PillToggleProps<T>) {
  return (
    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-md p-0.5 w-fit">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'text-[11px] px-2.5 py-0.5 rounded transition-colors font-medium',
            value === opt.value
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApiRequestEditor() {
  const dispatch = useAppDispatch()
  const { activeRequest, isSending } = useAppSelector(s => s.api)
  const { resolvedTheme } = useTheme()
  const [editingName, setEditingName] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (activeRequest) setUrlInput(activeRequest.url)
  }, [activeRequest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const draft = activeRequest
  const update = useCallback((partial: Partial<ApiRequestDraft>) => {
    dispatch(updateDraft(partial))
  }, [dispatch])

  if (!draft) return null

  const handleUrlChange = (value: string) => {
    setUrlInput(value)
    const parsedParams = parseQueryFromUrl(value)
    if (parsedParams.length > 0) {
      update({
        url: value,
        queryParams: [...parsedParams, { id: crypto.randomUUID(), key: '', value: '', enabled: true }]
      })
    } else {
      update({ url: stripQuery(value) })
    }
  }

  const handleParamsChange = (rows: KeyValueRow[]) => {
    const enabled = rows.filter(r => r.enabled && r.key)
    const newUrl = buildUrlFromParts(stripQuery(draft.url), enabled)
    setUrlInput(newUrl)
    update({ queryParams: rows, url: newUrl })
  }

  const handleSend = async () => { await dispatch(sendApiRequest(draft)) }
  const handleSave = async () => { await dispatch(saveApiRequest(draft)) }
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(draft.url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'
  const activeParamCount = draft.queryParams.filter(p => p.enabled && p.key).length
  const activeHeaderCount = draft.headers.filter(h => h.enabled && h.key).length

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950">

      {/* Name bar */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 shrink-0">
        {editingName ? (
          <Input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
            autoFocus
            className="h-6 text-sm font-medium py-0 px-1 max-w-xs"
          />
        ) : (
          <span
            className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-text hover:text-slate-900 dark:hover:text-slate-100 truncate max-w-xs"
            onClick={() => setEditingName(true)}
            title="Click to rename"
          >
            {draft.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyUrl}
            title="Copy URL"
            className="h-6 w-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <Copy className={cn('h-3 w-3', copied && 'text-green-500')} />
          </Button>
          <Button variant="outline" onClick={handleSave} className="h-6 px-2 text-xs gap-1">
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
      </div>

      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 pb-2 shrink-0">
        <Select value={draft.method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger className="w-28 h-8 shrink-0 text-xs font-mono border-slate-200 dark:border-slate-700">
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
          placeholder="Enter request URL"
          className="h-8 text-sm font-mono flex-1 min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />

        <Button
          onClick={handleSend}
          disabled={isSending || !draft.url}
          className="h-8 px-4 text-xs shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {isSending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending...</>
          ) : (
            <><Play className="h-3 w-3 fill-current" />Send</>
          )}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-slate-100 dark:border-slate-800">
        <Tabs defaultValue="params" className="h-full flex flex-col">
          <TabsList className="h-8 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0 gap-0">
            {(['params', 'headers', 'body', 'auth'] as const).map(tab => {
              const count = tab === 'params' ? activeParamCount : tab === 'headers' ? activeHeaderCount : 0
              const indicator = tab === 'body' && draft.bodyType !== 'none'
                ? draft.bodyType
                : tab === 'auth' && draft.authType !== 'none'
                  ? draft.authType
                  : count > 0 ? String(count) : null

              const indicatorColor = tab === 'body'
                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                : tab === 'auth'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                  : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'

              const labels: Record<string, string> = { params: 'Params', headers: 'Headers', body: 'Body', auth: 'Auth' }
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none gap-1"
                >
                  {labels[tab]}
                  {indicator && (
                    <span className={cn('text-[10px] px-1 rounded font-medium', indicatorColor)}>
                      {indicator}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Params */}
          <TabsContent value="params" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.queryParams}
              onChange={handleParamsChange}
              keyPlaceholder="Key"
              valuePlaceholder="Value"
            />
          </TabsContent>

          {/* Headers */}
          <TabsContent value="headers" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.headers}
              onChange={(rows) => update({ headers: rows })}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
            />
            <div className="mt-3">
              <p className="text-[11px] text-slate-400 mb-1.5">Quick add:</p>
              <div className="flex flex-wrap gap-1">
                {COMMON_HEADERS.map(h => (
                  <button
                    key={h}
                    onClick={() => {
                      if (!draft.headers.find(r => r.key === h)) {
                        update({ headers: [...draft.headers, { id: crypto.randomUUID(), key: h, value: '', enabled: true }] })
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Body */}
          <TabsContent value="body" className="flex-1 flex flex-col overflow-hidden p-0 m-0">
            <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <PillToggle<ApiRequestDraft['bodyType']>
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'json', label: 'JSON' },
                  { value: 'form', label: 'Form' },
                  { value: 'raw', label: 'Raw' }
                ]}
                value={draft.bodyType}
                onChange={(v) => update({ bodyType: v })}
              />
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
                    minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on',
                    automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2
                  }}
                />
              )}
              {draft.bodyType === 'form' && (
                <div className="p-3 overflow-y-auto h-full">
                  <KeyValueTable
                    rows={(() => { try { return JSON.parse(draft.body) as KeyValueRow[] } catch { return [] } })()}
                    onChange={(rows) => update({ body: JSON.stringify(rows) })}
                    keyPlaceholder="field"
                    valuePlaceholder="value"
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* Auth */}
          <TabsContent value="auth" className="flex-1 overflow-y-auto p-3 m-0">
            <div className="mb-4">
              <PillToggle<ApiRequestDraft['authType']>
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'bearer', label: 'Bearer' },
                  { value: 'basic', label: 'Basic' },
                  { value: 'apikey', label: 'API Key' }
                ]}
                value={draft.authType}
                onChange={(v) => update({ authType: v, authConfig: {} })}
              />
            </div>

            {draft.authType === 'none' && (
              <p className="text-xs text-slate-400 text-center py-4">No authentication configured</p>
            )}

            {draft.authType === 'bearer' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Token</label>
                <div className="flex gap-2">
                  <Input
                    value={draft.authConfig.token ?? ''}
                    onChange={(e) => update({ authConfig: { ...draft.authConfig, token: e.target.value } })}
                    placeholder="Enter bearer token"
                    className="h-8 text-xs font-mono flex-1"
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                    onClick={() => navigator.clipboard.writeText(draft.authConfig.token ?? '')}
                    title="Copy token"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Adds <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">Authorization: Bearer …</code> header
                </p>
              </div>
            )}

            {draft.authType === 'basic' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Username</label>
                    <Input
                      value={draft.authConfig.username ?? ''}
                      onChange={(e) => update({ authConfig: { ...draft.authConfig, username: e.target.value } })}
                      placeholder="Username"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Password</label>
                    <Input
                      type="password"
                      value={draft.authConfig.password ?? ''}
                      onChange={(e) => update({ authConfig: { ...draft.authConfig, password: e.target.value } })}
                      placeholder="Password"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Adds <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">Authorization: Basic base64(user:pass)</code>
                </p>
              </div>
            )}

            {draft.authType === 'apikey' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Key Name</label>
                    <Input
                      value={draft.authConfig.keyName ?? ''}
                      onChange={(e) => update({ authConfig: { ...draft.authConfig, keyName: e.target.value } })}
                      placeholder="X-API-Key"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Key Value</label>
                    <Input
                      value={draft.authConfig.keyValue ?? ''}
                      onChange={(e) => update({ authConfig: { ...draft.authConfig, keyValue: e.target.value } })}
                      placeholder="Your API key"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Add to</label>
                  <PillToggle
                    options={[
                      { value: 'header', label: 'Header' },
                      { value: 'query', label: 'Query Param' }
                    ]}
                    value={(draft.authConfig.keyLocation as 'header' | 'query') ?? 'header'}
                    onChange={(v) => update({ authConfig: { ...draft.authConfig, keyLocation: v } })}
                  />
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
