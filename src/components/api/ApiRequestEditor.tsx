'use client'

import { useState, useEffect, useCallback, useDeferredValue, useMemo, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { saveApiRequest, saveApiEnvironment, saveApiGlobals, sendApiRequest, setActiveEnvironment } from '@/features/api/apiSlice'
import type { ApiRequestDraft, KeyValueRow } from '@/features/api/apiSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyValueTable } from './KeyValueTable'
import { MethodBadge } from './MethodBadge'
import { VariableInspector } from './VariableInspector'
import { Loader2, Save, Play, Copy, Lock, FlaskConical, AlertTriangle, Upload, Cookie, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { materializeApiRequest, parseVariableRows, type ApiResponseMappingRow } from '@/lib/apiRequestMaterialization'
import { analyzeCurlCommand } from '@/lib/curlImport'
import { EditorSkeleton } from '@/components/ui/EditorSkeleton'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), {
    ssr: false,
    loading: () => <EditorSkeleton />,
})

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

const COMMON_HEADERS = [
  'Content-Type', 'Authorization', 'Accept', 'Accept-Language',
  'Cache-Control', 'Cookie', 'User-Agent', 'X-Requested-With',
  'X-API-Key', 'X-Auth-Token', 'Origin', 'Referer',
]

function blankRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true }
}

function ensureRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.length > 0 ? rows : [blankRow()]
}

function withMissingVariable(rows: KeyValueRow[], name: string): KeyValueRow[] {
  if (rows.some((row) => row.key === name)) return rows

  const filtered = rows.filter((row) => row.key || row.value)
  return [...filtered, { id: crypto.randomUUID(), key: name, value: '', enabled: true }, blankRow()]
}

function parseGraphqlBody(body: string): { query: string; variables: string; operationName: string } {
  try {
    const parsed = JSON.parse(body || '{}') as { query?: string; variables?: string; operationName?: string }
    return {
      query: parsed.query ?? '',
      variables: parsed.variables ?? '{}',
      operationName: parsed.operationName ?? '',
    }
  } catch {
    return { query: '', variables: '{}', operationName: '' }
  }
}

function stringifyGraphqlBody(value: { query: string; variables: string; operationName: string }): string {
  return JSON.stringify(value)
}

function parseBinaryBody(body: string): { fileName: string; mimeType: string; data: string } {
  try {
    const parsed = JSON.parse(body || '{}') as { fileName?: string; mimeType?: string; data?: string }
    return {
      fileName: parsed.fileName ?? '',
      mimeType: parsed.mimeType ?? '',
      data: parsed.data ?? '',
    }
  } catch {
    return { fileName: '', mimeType: '', data: '' }
  }
}

function parseKeyValueBody(body: string, fallback: KeyValueRow[]): KeyValueRow[] {
  try {
    return JSON.parse(body) as KeyValueRow[]
  } catch {
    return fallback
  }
}

function blankResponseMapping(): ApiResponseMappingRow {
  return {
    id: crypto.randomUUID(),
    sourcePath: '',
    variableName: '',
    targetScope: 'environment',
    enabled: true,
  }
}

function ensureResponseMappings(rows: ApiResponseMappingRow[]): ApiResponseMappingRow[] {
  return rows.length > 0 ? rows : [blankResponseMapping()]
}

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
  const { activeRequest, isSending, error, environments, activeEnvironmentId, globalVariables, collections } = useAppSelector(s => s.api)
  const { resolvedTheme } = useTheme()
  const [editingName, setEditingName] = useState(false)
  const [activeTab, setActiveTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'variables' | 'pre-request' | 'post-request'>('params')
  const [urlInput, setUrlInput] = useState('')
  const [copied, setCopied] = useState(false)
  const [curlDialogOpen, setCurlDialogOpen] = useState(false)
  const [curlInput, setCurlInput] = useState('')
  const [curlImportError, setCurlImportError] = useState<string | null>(null)
  const [isSavingRequest, setIsSavingRequest] = useState(false)
  const [isImportingCurl, setIsImportingCurl] = useState(false)
  const [draft, setDraft] = useState<ApiRequestDraft | null>(activeRequest)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(activeRequest)
    setUrlInput(activeRequest?.url ?? '')
  }, [activeRequest])

  useEffect(() => {
    setActiveTab('params')
  }, [activeRequest?.id])

  const update = useCallback((partial: Partial<ApiRequestDraft>) => {
    setDraft((current) => current ? { ...current, ...partial } : current)
  }, [])

  const curlAnalysis = useMemo(() => {
    if (!curlInput.trim()) return null
    try {
      return { result: analyzeCurlCommand(curlInput), error: null as string | null }
    } catch (error) {
      return {
        result: null,
        error: error instanceof Error ? error.message : 'Unable to parse cURL command',
      }
    }
  }, [curlInput])

  if (!draft) return null

  const deferredDraft = useDeferredValue(draft)
  const variablePreview = useMemo(() => {
    const environment = activeEnvironmentId
      ? environments.find((item) => item.id === activeEnvironmentId)
      : null
    const collection = deferredDraft.collectionId
      ? collections.find((item) => item.id === deferredDraft.collectionId)
      : null

    return materializeApiRequest(deferredDraft, {
      global: globalVariables,
      environment: parseVariableRows(environment?.variables).map((row) => ({
        id: row.id ?? crypto.randomUUID(),
        key: row.key ?? '',
        value: row.value ?? '',
        enabled: row.enabled ?? true,
      })),
      collection: parseVariableRows(collection?.variables).map((row) => ({
        id: row.id ?? crypto.randomUUID(),
        key: row.key ?? '',
        value: row.value ?? '',
        enabled: row.enabled ?? true,
      })),
    })
  }, [collections, deferredDraft, environments, activeEnvironmentId, globalVariables])

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
  const activeVariableCount = draft.variables.filter(v => v.enabled && v.key).length
  const unresolvedCount = variablePreview?.unresolvedVariables.length ?? 0
  const activeEnvironment = environments.find((environment) => environment.id === activeEnvironmentId) ?? null

  const addMissingVariableToRequest = (name: string) => {
    update({ variables: withMissingVariable(draft.variables, name) })
    setActiveTab('variables')
  }

  const addMissingVariableToEnvironment = async (name: string) => {
    if (!activeEnvironment) return
    const rows = ensureRows(parseVariableRows(activeEnvironment.variables).map((row) => ({
      id: row.id ?? crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: row.enabled,
    })))

    await dispatch(saveApiEnvironment({
      id: activeEnvironment.id,
      name: activeEnvironment.name,
      variables: withMissingVariable(rows, name),
    }))
  }

  const addMissingVariableToGlobals = async (name: string) => {
    await dispatch(saveApiGlobals(withMissingVariable(globalVariables, name)))
  }

  const handleCurlImport = () => {
    if (!curlAnalysis?.result) {
      setCurlImportError(curlAnalysis?.error ?? 'Unable to parse cURL command')
      return
    }
    update(curlAnalysis.result.draft)
    if (typeof curlAnalysis.result.draft.url === 'string') {
      setUrlInput(curlAnalysis.result.draft.url)
    }
    setCurlImportError(null)
    setCurlDialogOpen(false)
  }

  const graphqlBody = parseGraphqlBody(draft.body)
  const binaryBody = parseBinaryBody(draft.body)
  const responseMappings = ensureResponseMappings(draft.responseMappings ?? [])
  const formBodyRows = useMemo(() => parseKeyValueBody(draft.body, []), [draft.body])
  const multipartBodyRows = useMemo(() => parseKeyValueBody(draft.body, [blankRow()]), [draft.body])

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
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Environment</span>
            <Select value={activeEnvironmentId ?? '__none__'} onValueChange={(value) => dispatch(setActiveEnvironment(value === '__none__' ? null : value))}>
              <SelectTrigger className="h-7 w-[170px] text-xs border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="No environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs">No environment</SelectItem>
                {environments.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id} className="text-xs">
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            onClick={() => setCurlDialogOpen(true)}
            className="h-7 px-2.5 text-xs gap-1 border-slate-200 dark:border-slate-700"
          >
            Import cURL
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
          disabled={isSending || !draft.url || unresolvedCount > 0}
          className="h-9 px-4 text-sm shrink-0 gap-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 font-medium"
        >
          {isSending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending</>
          ) : (
            <><Play className="h-3.5 w-3.5 fill-current" />Send</>
          )}
        </Button>
      </div>

      <div className="px-3 pb-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
            <span>{variablePreview?.variables.length ?? 0} variable{(variablePreview?.variables.length ?? 0) === 1 ? '' : 's'} detected</span>
          </div>
          {activeEnvironment && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {activeEnvironment.name}
            </span>
          )}
          {unresolvedCount > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {unresolvedCount} missing
            </span>
          ) : variablePreview && variablePreview.variables.length > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              All variables resolved
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-slate-100 dark:border-slate-800">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="h-full flex flex-col">

          {/* Tab bar */}
          <TabsList className="h-9 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0 gap-0">
            {(['params', 'headers', 'body', 'auth', 'variables', 'pre-request', 'post-request'] as const).map(tab => {
              const count = tab === 'params' ? activeParamCount : tab === 'headers' ? activeHeaderCount : 0
              const indicator =
                tab === 'body' && draft.bodyType !== 'none'
                  ? draft.bodyType
                  : tab === 'auth' && draft.authType !== 'none'
                    ? draft.authType
                    : tab === 'variables' && unresolvedCount > 0
                      ? `${unresolvedCount} missing`
                      : tab === 'variables' && activeVariableCount > 0
                        ? String(activeVariableCount)
                      : tab === 'pre-request' && draft.preRequestScript
                        ? 'js'
                      : tab === 'post-request' && draft.testScript
                        ? 'js'
                      : count > 0
                      ? String(count)
                      : null

              const indicatorColor =
                tab === 'body'
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400'
                  : tab === 'auth'
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : tab === 'variables'
                      ? unresolvedCount > 0
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : tab === 'pre-request' || tab === 'post-request'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'

              const labels: Record<string, string> = {
                params: 'Params',
                headers: 'Headers',
                body: 'Body',
                auth: 'Auth',
                variables: 'Variables',
                'pre-request': 'Pre-request',
                'post-request': 'Post-request',
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

          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'params' && (
              <TabsContent value="params" forceMount className="h-full overflow-y-auto p-3 m-0">
                <KeyValueTable
                  rows={draft.queryParams}
                  onChange={handleParamsChange}
                  keyPlaceholder="Key"
                  valuePlaceholder="Value"
                />
              </TabsContent>
            )}

            {activeTab === 'headers' && (
              <TabsContent value="headers" forceMount className="h-full overflow-y-auto p-3 m-0">
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
            )}

            {activeTab === 'body' && (
              <TabsContent value="body" forceMount className="h-full flex flex-col overflow-hidden p-0 m-0">
                <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">Format</span>
                  <PillToggle<ApiRequestDraft['bodyType']>
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'json', label: 'JSON' },
                      { value: 'form', label: 'Form' },
                      { value: 'multipart', label: 'Multipart' },
                      { value: 'graphql', label: 'GraphQL' },
                      { value: 'binary', label: 'Binary' },
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
                          rows={formBodyRows}
                          onChange={(rows) => update({ body: JSON.stringify(rows) })}
                          keyPlaceholder="field"
                          valuePlaceholder="value"
                        />
                      </div>
                    )}
                  {draft.bodyType === 'multipart' && (
                      <div className="p-3 overflow-y-auto h-full">
                        <KeyValueTable
                          rows={multipartBodyRows}
                          onChange={(rows) => update({ body: JSON.stringify(rows) })}
                          keyPlaceholder="field"
                          valuePlaceholder="value"
                        />
                    </div>
                  )}
                  {draft.bodyType === 'graphql' && (
                    <div className="h-full grid grid-rows-[auto,1fr,auto,1fr] min-h-0">
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Operation Name</label>
                        <Input
                          value={graphqlBody.operationName}
                          onChange={(e) => update({ body: stringifyGraphqlBody({ ...graphqlBody, operationName: e.target.value }) })}
                          placeholder="Optional"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="min-h-0 border-b border-slate-100 dark:border-slate-800">
                        <MonacoEditor
                          height="100%"
                          language="graphql"
                          value={graphqlBody.query}
                          onChange={(value) => update({ body: stringifyGraphqlBody({ ...graphqlBody, query: value ?? '' }) })}
                          theme={editorTheme}
                          options={{
                            minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on',
                            automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2,
                          }}
                        />
                      </div>
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Variables JSON</span>
                      </div>
                      <div className="min-h-0">
                        <MonacoEditor
                          height="100%"
                          language="json"
                          value={graphqlBody.variables}
                          onChange={(value) => update({ body: stringifyGraphqlBody({ ...graphqlBody, variables: value ?? '{}' }) })}
                          theme={editorTheme}
                          options={{
                            minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on',
                            automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {draft.bodyType === 'binary' && (
                    <div className="p-4 space-y-4">
                      <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4">
                        <div className="flex items-center gap-3">
                          <Button variant="outline" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="h-4 w-4" />
                            Choose File
                          </Button>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                              {binaryBody.fileName || 'No file selected'}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {binaryBody.mimeType || 'application/octet-stream'}
                            </p>
                          </div>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={async (event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            const arrayBuffer = await file.arrayBuffer()
                            const bytes = new Uint8Array(arrayBuffer)
                            let binary = ''
                            bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
                            update({
                              body: JSON.stringify({
                                fileName: file.name,
                                mimeType: file.type || 'application/octet-stream',
                                data: btoa(binary),
                              }),
                            })
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {activeTab === 'auth' && (
              <TabsContent value="auth" forceMount className="h-full overflow-hidden m-0 flex flex-col">
                <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">Type</span>
                  <PillToggle<ApiRequestDraft['authType']>
                    options={[
                      { value: 'none', label: 'None' },
                      { value: 'bearer', label: 'Bearer' },
                      { value: 'basic', label: 'Basic' },
                      { value: 'apikey', label: 'API Key' },
                      { value: 'oauth2', label: 'OAuth 2.0' },
                    ]}
                    value={draft.authType}
                    onChange={(v) => update({ authType: v, authConfig: {}, requestOptions: draft.requestOptions })}
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  <div className="mb-4 rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <Cookie className="h-3.5 w-3.5 text-slate-400" />
                        Cookie Jar
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Reuse cookies for the same host across requests on this machine.
                      </p>
                    </div>
                    <PillToggle<'off' | 'on'>
                      options={[
                        { value: 'off', label: 'Off' },
                        { value: 'on', label: 'On' },
                      ]}
                      value={draft.requestOptions?.useCookieJar ? 'on' : 'off'}
                      onChange={(value) => update({ requestOptions: { ...(draft.requestOptions ?? {}), useCookieJar: value === 'on' } })}
                    />
                  </div>

                  {draft.authType === 'none' && (
                    <div className="flex flex-col items-center justify-start py-8 gap-3 text-center">
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

                  {draft.authType === 'oauth2' && (
                    <div className="space-y-3 max-w-lg">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Access Token</label>
                        <Input
                          value={draft.authConfig.accessToken ?? ''}
                          onChange={(e) => update({ authConfig: { ...draft.authConfig, accessToken: e.target.value } })}
                          placeholder="Paste OAuth 2.0 access token"
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Token Type</label>
                        <Input
                          value={draft.authConfig.tokenType ?? 'Bearer'}
                          onChange={(e) => update({ authConfig: { ...draft.authConfig, tokenType: e.target.value } })}
                          placeholder="Bearer"
                          className="h-9 text-xs"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-md flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" />
                        Sends the access token as an Authorization header.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {activeTab === 'variables' && (
              <TabsContent value="variables" forceMount className="h-full overflow-y-auto p-3 m-0">
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Request Variables</p>
                    <KeyValueTable
                      rows={draft.variables}
                      onChange={(rows) => update({ variables: rows })}
                      keyPlaceholder="Variable name"
                      valuePlaceholder="Value"
                    />
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Capture From Response</p>
                    <div className="space-y-2">
                      {responseMappings.map((mapping) => (
                        <div key={mapping.id ?? `${mapping.sourcePath}-${mapping.variableName}`} className="grid grid-cols-[1.2fr,1fr,140px,32px] gap-2 items-center">
                          <Input
                            value={mapping.sourcePath}
                            onChange={(e) => update({
                              responseMappings: responseMappings.map((item) =>
                                item.id === mapping.id ? { ...item, sourcePath: e.target.value } : item
                              )
                            })}
                            placeholder="data.user.token"
                            className="h-8 text-xs font-mono"
                          />
                          <Input
                            value={mapping.variableName}
                            onChange={(e) => update({
                              responseMappings: responseMappings.map((item) =>
                                item.id === mapping.id ? { ...item, variableName: e.target.value } : item
                              )
                            })}
                            placeholder="auth_token"
                            className="h-8 text-xs"
                          />
                          <Select
                            value={mapping.targetScope}
                            onValueChange={(value) => update({
                              responseMappings: responseMappings.map((item) =>
                                item.id === mapping.id ? { ...item, targetScope: value as ApiResponseMappingRow['targetScope'] } : item
                              )
                            })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="request" className="text-xs">Request</SelectItem>
                              <SelectItem value="environment" className="text-xs">Environment</SelectItem>
                              <SelectItem value="global" className="text-xs">Global</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-500"
                            onClick={() => update({
                              responseMappings: ensureResponseMappings(responseMappings.filter((item) => item.id !== mapping.id))
                            })}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => update({ responseMappings: [...responseMappings, blankResponseMapping()] })}
                      >
                        Add Capture Rule
                      </Button>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        Uses dot paths from a JSON response body and stores the value into request, environment, or global variables after the request finishes.
                      </p>
                    </div>
                  </div>

                  <VariableInspector
                    preview={variablePreview}
                    hasActiveEnvironment={Boolean(activeEnvironment)}
                    onAddToRequest={addMissingVariableToRequest}
                    onAddToEnvironment={addMissingVariableToEnvironment}
                    onAddToGlobals={addMissingVariableToGlobals}
                  />
                </div>
              </TabsContent>
            )}

            {activeTab === 'pre-request' && (
              <TabsContent value="pre-request" forceMount className="h-full flex flex-col overflow-hidden m-0">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Pre-request Script</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Runs before the request is sent. Mutate `request` or log with `console.log(...)`.
                  </p>
                </div>
                <div className="flex-1 min-h-0">
                  <MonacoEditor
                    height="100%"
                    language="javascript"
                    value={draft.preRequestScript ?? ''}
                    onChange={(value) => update({ preRequestScript: value ?? '' })}
                    theme={editorTheme}
                    options={{
                      minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on',
                      automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2,
                    }}
                  />
                </div>
              </TabsContent>
            )}

            {activeTab === 'post-request' && (
              <TabsContent value="post-request" forceMount className="h-full flex flex-col overflow-hidden m-0">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Post-request Script</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Runs after the response returns. You can inspect `response`, log to the console, and use `test(name, fn)` with `expect(...)`.
                  </p>
                </div>
                <div className="flex-1 min-h-0">
                  <MonacoEditor
                    height="100%"
                    language="javascript"
                    value={draft.testScript ?? ''}
                    onChange={(value) => update({ testScript: value ?? '' })}
                    theme={editorTheme}
                    options={{
                      minimap: { enabled: false }, fontSize: 12, lineNumbers: 'on',
                      automaticLayout: true, wordWrap: 'on', scrollBeyondLastLine: false, tabSize: 2,
                    }}
                  />
                </div>
              </TabsContent>
            )}
          </div>

        </Tabs>
      </div>

      <Dialog open={curlDialogOpen} onOpenChange={setCurlDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Import cURL</DialogTitle>
            <DialogDescription>
              Paste a cURL command to preview and import method, URL, auth, headers, and body before applying it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">cURL Command</p>
                </div>
                <textarea
                  value={curlInput}
                  onChange={(e) => { setCurlInput(e.target.value); setCurlImportError(null) }}
                  placeholder={`curl https://api.example.com/users -H "Authorization: Bearer token" -H "Content-Type: application/json" -d '{"name":"Anand"}'`}
                  className="min-h-[320px] w-full resize-none border-0 bg-white dark:bg-slate-950 px-3 py-3 text-xs font-mono outline-none focus:ring-0"
                />
              </div>
              {(curlImportError || curlAnalysis?.error) && (
                <p className="text-xs text-red-500">{curlImportError ?? curlAnalysis?.error}</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Import Preview</p>
                </div>
                <div className="p-3 space-y-3">
                  {curlAnalysis?.result ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Method</p>
                          <p className="mt-1 text-xs font-mono text-slate-700 dark:text-slate-200">{curlAnalysis.result.summary.method}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Auth</p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{curlAnalysis.result.summary.authType}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Headers</p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{curlAnalysis.result.summary.headerCount}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">Body</p>
                          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{curlAnalysis.result.summary.bodyType}</p>
                        </div>
                      </div>

                      <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">URL</p>
                        <p className="mt-1 text-xs font-mono break-all text-slate-700 dark:text-slate-200">
                          {curlAnalysis.result.summary.url}
                        </p>
                      </div>

                      <div className="rounded-md border border-slate-200 dark:border-slate-800 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400">What Will Be Imported</p>
                        <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                          <p>Method and URL</p>
                          <p>Headers and detected auth</p>
                          <p>Body mapped to {curlAnalysis.result.summary.bodyType}</p>
                          <p>Query params merged into the URL</p>
                        </div>
                      </div>

                      {curlAnalysis.result.warnings.length > 0 && (
                        <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-2">
                          <p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-300">Warnings</p>
                          <div className="mt-2 space-y-1">
                            {curlAnalysis.result.warnings.slice(0, 6).map((warning) => (
                              <p key={warning} className="text-xs text-amber-700 dark:text-amber-200">{warning}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Paste a cURL command to see a live import preview.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurlDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCurlImport} disabled={!curlAnalysis?.result}>Import Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
