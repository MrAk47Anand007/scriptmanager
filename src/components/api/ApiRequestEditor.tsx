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
import { Loader2, Save, Play, Copy, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false })

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const COMMON_HEADERS = [
  'Content-Type', 'Authorization', 'Accept', 'Accept-Language',
  'Cache-Control', 'Cookie', 'User-Agent', 'X-Requested-With',
  'X-API-Key', 'X-Auth-Token', 'Origin', 'Referer',
]

// ─── URL helpers ──────────────────────────────────────────────────────────────

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
  className?: string
}

function PillToggle<T extends string>({ options, value, onChange, className }: PillToggleProps<T>) {
  return (
    <div className={cn(
      'flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-md p-0.5 w-fit',
      className
    )}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'text-[11px] px-2.5 py-1 rounded transition-colors font-medium',
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

// ─── Main component ───────────────────────────────────────────────────────────

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
        queryParams: [...parsedParams, { id: crypto.randomUUID(), key: '', value: '', enabled: true }],
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

      {/* ── Request name bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shrink-0">
        {editingName ? (
          <Input
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
            autoFocus
            className="h-7 text-sm font-semibold py-0 px-2 max-w-xs bg-white dark:bg-slate-900"
          />
        ) : (
          <span
            className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-text truncate max-w-xs hover:text-slate-900 dark:hover:text-white"
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
            className="h-7 w-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <Copy className={cn('h-3.5 w-3.5', copied && 'text-green-500')} />
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            className="h-7 px-2.5 text-xs gap-1 border-slate-200 dark:border-slate-700"
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
        </div>
      </div>

      {/* ── URL bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        <Select value={draft.method} onValueChange={(v) => update({ method: v })}>
          <SelectTrigger className="w-[108px] h-9 shrink-0 text-xs font-mono border-slate-200 dark:border-slate-700">
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
          className="h-9 text-sm font-mono flex-1 min-w-0"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
        />

        <Button
          onClick={handleSend}
          disabled={isSending || !draft.url}
          className="h-9 px-4 text-sm shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 font-medium"
        >
          {isSending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending</>
          ) : (
            <><Play className="h-3.5 w-3.5 fill-current" />Send</>
          )}
        </Button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-slate-100 dark:border-slate-800">
        <Tabs defaultValue="params" className="h-full flex flex-col">

          {/* Tab bar */}
          <TabsList className="h-9 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0 gap-0">
            {(['params', 'headers', 'body', 'auth'] as const).map(tab => {
              const count = tab === 'params' ? activeParamCount : tab === 'headers' ? activeHeaderCount : 0
              const indicator =
                tab === 'body' && draft.bodyType !== 'none'
                  ? draft.bodyType
                  : tab === 'auth' && draft.authType !== 'none'
                    ? draft.authType
                    : count > 0
                      ? String(count)
                      : null

              const indicatorColor =
                tab === 'body'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                  : tab === 'auth'
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'

              const labels: Record<string, string> = {
                params: 'Params', headers: 'Headers', body: 'Body', auth: 'Auth',
              }

              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={cn(
                    'text-xs h-8 px-3 gap-1.5 rounded-none transition-colors',
                    'data-[state=active]:bg-transparent data-[state=active]:border-b-2',
                    'data-[state=active]:border-blue-500 data-[state=active]:shadow-none',
                    'data-[state=inactive]:text-slate-500 dark:data-[state=inactive]:text-slate-400',
                  )}
                >
                  {labels[tab]}
                  {indicator && (
                    <span className={cn('text-[10px] px-1.5 py-0 rounded-full font-semibold leading-4', indicatorColor)}>
                      {indicator}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* ── Params ───────────────────────────────────────────────────── */}
          <TabsContent value="params" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.queryParams}
              onChange={handleParamsChange}
              keyPlaceholder="Key"
              valuePlaceholder="Value"
            />
          </TabsContent>

          {/* ── Headers ──────────────────────────────────────────────────── */}
          <TabsContent value="headers" className="flex-1 overflow-y-auto p-3 m-0">
            <KeyValueTable
              rows={draft.headers}
              onChange={(rows) => update({ headers: rows })}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
            />
            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Quick add</p>
              <div className="flex flex-wrap gap-1">
                {COMMON_HEADERS.map(h => (
                  <button
                    key={h}
                    onClick={() => {
                      if (!draft.headers.find(r => r.key === h)) {
                        update({
                          headers: [
                            ...draft.headers,
                            { id: crypto.randomUUID(), key: h, value: '', enabled: true },
                          ],
                        })
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 font-mono transition-colors"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <TabsContent value="body" className="flex-1 flex flex-col overflow-hidden p-0 m-0">
            {/* Body type header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">Format</span>
              <PillToggle<ApiRequestDraft['bodyType']>
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'json', label: 'JSON' },
                  { value: 'form', label: 'Form' },
                  { value: 'raw', label: 'Raw' },
                ]}
                value={draft.bodyType}
                onChange={(v) => update({ bodyType: v })}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {draft.bodyType === 'none' && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center">
                    <span className="text-lg">∅</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">No request body</p>
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
                    automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2,
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

          {/* ── Auth ─────────────────────────────────────────────────────── */}
          <TabsContent value="auth" className="flex-1 overflow-hidden m-0 flex flex-col">

            {/* Auth type selector — always-visible sticky header */}
            <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">Type</span>
              <PillToggle<ApiRequestDraft['authType']>
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'bearer', label: 'Bearer' },
                  { value: 'basic', label: 'Basic' },
                  { value: 'apikey', label: 'API Key' },
                ]}
                value={draft.authType}
                onChange={(v) => update({ authType: v, authConfig: {} })}
              />
            </div>

            {/* Auth content — scrollable */}
            <div className="flex-1 overflow-y-auto p-4">

              {draft.authType === 'none' && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No authentication</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Select a type above to configure credentials
                    </p>
                  </div>
                </div>
              )}

              {draft.authType === 'bearer' && (
                <div className="space-y-3 max-w-lg">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Token</label>
                    <div className="flex gap-2">
                      <Input
                        value={draft.authConfig.token ?? ''}
                        onChange={(e) => update({ authConfig: { ...draft.authConfig, token: e.target.value } })}
                        placeholder="Enter bearer token"
                        className="h-9 text-xs font-mono flex-1"
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="h-9 w-9 shrink-0 text-slate-400 hover:text-slate-600"
                        onClick={() => navigator.clipboard.writeText(draft.authConfig.token ?? '')}
                        title="Copy token"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-md">
                    Sends <code className="font-mono text-blue-600 dark:text-blue-400">Authorization: Bearer &lt;token&gt;</code> header
                  </p>
                </div>
              )}

              {draft.authType === 'basic' && (
                <div className="space-y-3 max-w-lg">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Username</label>
                      <Input
                        value={draft.authConfig.username ?? ''}
                        onChange={(e) => update({ authConfig: { ...draft.authConfig, username: e.target.value } })}
                        placeholder="Username"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Password</label>
                      <Input
                        type="password"
                        value={draft.authConfig.password ?? ''}
                        onChange={(e) => update({ authConfig: { ...draft.authConfig, password: e.target.value } })}
                        placeholder="Password"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-md">
                    Sends <code className="font-mono text-blue-600 dark:text-blue-400">Authorization: Basic base64(user:pass)</code> header
                  </p>
                </div>
              )}

              {draft.authType === 'apikey' && (
                <div className="space-y-3 max-w-lg">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Key Name</label>
                      <Input
                        value={draft.authConfig.keyName ?? ''}
                        onChange={(e) => update({ authConfig: { ...draft.authConfig, keyName: e.target.value } })}
                        placeholder="X-API-Key"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Key Value</label>
                      <Input
                        value={draft.authConfig.keyValue ?? ''}
                        onChange={(e) => update({ authConfig: { ...draft.authConfig, keyValue: e.target.value } })}
                        placeholder="Your API key"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Add to</label>
                    <PillToggle
                      options={[
                        { value: 'header', label: 'Header' },
                        { value: 'query', label: 'Query Param' },
                      ]}
                      value={(draft.authConfig.keyLocation as 'header' | 'query') ?? 'header'}
                      onChange={(v) => update({ authConfig: { ...draft.authConfig, keyLocation: v } })}
                    />
                  </div>
                </div>
              )}

            </div>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
