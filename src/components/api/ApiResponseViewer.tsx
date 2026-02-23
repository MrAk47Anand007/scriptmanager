'use client'

import { useState, useMemo } from 'react'
import { useAppSelector } from '@/store/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from './StatusBadge'
import { MethodBadge } from './MethodBadge'
import { AlertTriangle, Clock, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false })

function detectLanguage(body: string, headers: Record<string, string>): string {
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? ''
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return 'json'
  }
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return 'html'
  }
  if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
    return 'xml'
  }
  // Fallback: try to detect from content
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return 'json' } catch { /* not JSON */ }
  }
  if (trimmed.startsWith('<html') || trimmed.startsWith('<!DOCTYPE')) return 'html'
  if (trimmed.startsWith('<')) return 'xml'
  return 'plaintext'
}

function formatBody(body: string, language: string): string {
  if (language === 'json') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2)
    } catch {
      return body
    }
  }
  return body
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function ApiResponseViewer() {
  const { response, history, activeRequestId } = useAppSelector(s => s.api)
  const { resolvedTheme } = useTheme()
  const [rawMode, setRawMode] = useState(false)

  const editorTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'light'

  const language = useMemo(() => {
    if (!response) return 'plaintext'
    return detectLanguage(response.body, response.headers)
  }, [response])

  const displayBody = useMemo(() => {
    if (!response) return ''
    if (rawMode) return response.body
    return formatBody(response.body, language)
  }, [response, language, rawMode])

  // History for current request (last 20 entries matching requestId or url)
  const requestHistory = useMemo(() => {
    if (!history.length) return []
    const relevant = activeRequestId
      ? history.filter(h => h.request_id === activeRequestId)
      : []
    // Fall back to recent by URL if no requestId match
    const items = relevant.length > 0 ? relevant : history.slice(0, 20)
    return items.slice(0, 20)
  }, [history, activeRequestId])

  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
        <Database className="h-10 w-10 text-slate-200 dark:text-slate-700 mb-3" />
        <p className="text-sm text-slate-400">No response yet</p>
        <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Hit "Send" to make a request</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/50">
        {response.error ? (
          <span className="text-sm text-red-600 dark:text-red-400 font-medium">Error</span>
        ) : (
          <StatusBadge status={response.status} statusText={response.statusText} />
        )}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3 w-3" />
          <span>{response.duration}ms</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Database className="h-3 w-3" />
          <span>{formatSize(response.size)}</span>
        </div>
        {response.truncated && (
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded">
            Truncated
          </span>
        )}
      </div>

      {/* Error alert */}
      {response.error && (
        <Alert variant="destructive" className="m-3 mb-0">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{response.error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      {!response.error && (
        <Tabs defaultValue="body" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="h-8 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0">
            <TabsTrigger value="body" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Body
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              Headers
              <span className="ml-1 text-[10px] text-slate-400">
                ({Object.keys(response.headers).length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none">
              History
              {requestHistory.length > 0 && (
                <span className="ml-1 text-[10px] text-slate-400">({requestHistory.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Body tab */}
          <TabsContent value="body" className="flex-1 flex flex-col min-h-0 overflow-hidden m-0">
            <div className="flex items-center justify-between px-3 py-1 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">{language}</span>
              <button
                onClick={() => setRawMode(!rawMode)}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded border transition-colors',
                  rawMode
                    ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                )}
              >
                {rawMode ? 'Pretty' : 'Raw'}
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <MonacoEditor
                height="100%"
                language={rawMode ? 'plaintext' : language}
                value={displayBody}
                theme={editorTheme}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'off',
                  automaticLayout: true,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  domReadOnly: true
                }}
              />
            </div>
          </TabsContent>

          {/* Headers tab */}
          <TabsContent value="headers" className="flex-1 overflow-y-auto m-0">
            <table className="w-full text-xs">
              <tbody>
                {Object.entries(response.headers).map(([key, value]) => (
                  <tr key={key} className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="py-1.5 px-3 font-mono text-slate-500 dark:text-slate-400 w-2/5 break-all align-top">
                      {key}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all">
                      {value}
                    </td>
                  </tr>
                ))}
                {Object.keys(response.headers).length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-4 px-3 text-center text-slate-400">
                      No response headers
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="flex-1 overflow-y-auto m-0">
            {requestHistory.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                No history for this request
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="py-1.5 px-3 text-left font-medium text-slate-500">Method</th>
                    <th className="py-1.5 px-3 text-left font-medium text-slate-500">URL</th>
                    <th className="py-1.5 px-3 text-left font-medium text-slate-500">Status</th>
                    <th className="py-1.5 px-3 text-left font-medium text-slate-500">Time</th>
                    <th className="py-1.5 px-3 text-left font-medium text-slate-500">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {requestHistory.map(h => (
                    <tr key={h.id} className="border-b border-slate-50 dark:border-slate-900 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="py-1.5 px-3">
                        <MethodBadge method={h.method} small />
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {h.url}
                      </td>
                      <td className="py-1.5 px-3">
                        <span className={cn(
                          'font-mono font-semibold',
                          h.status >= 200 && h.status < 300 ? 'text-green-600 dark:text-green-400' :
                          h.status >= 400 ? 'text-red-500 dark:text-red-400' :
                          'text-slate-500'
                        )}>
                          {h.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-slate-500">{h.duration}ms</td>
                      <td className="py-1.5 px-3 text-slate-500">{formatSize(h.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
