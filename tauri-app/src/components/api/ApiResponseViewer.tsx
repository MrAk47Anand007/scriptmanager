import dynamic from '@/lib/dynamic';


import { lazy,  useState, useMemo  } from 'react'
import { useAppSelector } from '@/store/hooks'
import { selectApiResponse, selectApiHistory, selectApiActiveRequestId } from '@/features/api/selectors'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { StatusBadge } from './StatusBadge'
import { MethodBadge } from './MethodBadge'
import { AlertTriangle, Clock, Database, Globe, Copy, Check, TerminalSquare, Beaker, ArrowDownToLine } from 'lucide-react'
import { cn } from '@/lib/utils'

import { useTheme } from 'next-themes'

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then(m => m.Editor), { ssr: false })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectLanguage(body: string, headers: Record<string, string>): string {
  const ct = headers['content-type'] ?? headers['Content-Type'] ?? ''
  if (ct.includes('application/json') || ct.includes('+json')) return 'json'
  if (ct.includes('text/html') || ct.includes('application/xhtml')) return 'html'
  if (ct.includes('application/xml') || ct.includes('text/xml')) return 'xml'
  const t = body.trim()
  if (t.startsWith('{') || t.startsWith('[')) {
    try { JSON.parse(t); return 'json' } catch { /* not JSON */ }
  }
  if (t.startsWith('<html') || t.startsWith('<!DOCTYPE')) return 'html'
  if (t.startsWith('<')) return 'xml'
  return 'plaintext'
}

function formatBody(body: string, language: string): string {
  if (language === 'json') {
    try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
  }
  return body
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApiResponseViewer() {
  const response = useAppSelector(selectApiResponse)
  const history = useAppSelector(selectApiHistory)
  const activeRequestId = useAppSelector(selectApiActiveRequestId)
  const { resolvedTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'tests' | 'console' | 'output' | 'history'>('body')
  const [rawMode, setRawMode] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const requestHistory = useMemo(() => {
    if (!history.length) return []
    const relevant = activeRequestId
      ? history.filter(h => h.request_id === activeRequestId)
      : []
    const items = relevant.length > 0 ? relevant : history.slice(0, 20)
    return items.slice(0, 20)
  }, [history, activeRequestId])

  const handleCopyBody = () => {
    if (!response) return
    navigator.clipboard.writeText(response.body).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // ── Empty state ──
  if (!response) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-800 gap-3">
        <Globe className="h-10 w-10 text-slate-200 dark:text-slate-700" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Send a request to see the response</p>
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Results will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-900/50">
        {response.error ? (
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">Error</span>
        ) : (
          <StatusBadge status={response.status} statusText={response.statusText} />
        )}

        {!response.error && (
          <>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="h-3 w-3" />
              <span>{response.duration}ms</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Database className="h-3 w-3" />
              <span>{formatSize(response.size)}</span>
            </div>
            {response.truncated && (
              <span className="text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded font-medium">
                Truncated
              </span>
            )}
          </>
        )}

        {/* Copy body button */}
        <button
          onClick={handleCopyBody}
          className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          title="Copy response body"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Error alert */}
      {response.error && (
        <Alert variant="destructive" className="m-3 mb-0 shrink-0">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs font-mono">{response.error}</AlertDescription>
        </Alert>
      )}

      {/* Response tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="h-8 px-3 rounded-none border-b border-slate-100 dark:border-slate-800 justify-start bg-transparent shrink-0 gap-0">
          <TabsTrigger value="body" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            Body
          </TabsTrigger>
          <TabsTrigger value="headers" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            Headers
            <span className="ml-1 text-[10px] text-slate-400">
              ({Object.keys(response.headers).length})
            </span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            History
            {requestHistory.length > 0 && (
              <span className="ml-1 text-[10px] text-slate-400">({requestHistory.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="tests" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            Tests
            {response.testResults && response.testResults.length > 0 && (
              <span className="ml-1 text-[10px] text-slate-400">({response.testResults.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="console" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            Console
            {response.consoleLogs && response.consoleLogs.length > 0 && (
              <span className="ml-1 text-[10px] text-slate-400">({response.consoleLogs.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="output" className="text-xs h-7 px-3 data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:shadow-none rounded-none">
            Output
            {response.mappingResults && response.mappingResults.length > 0 && (
              <span className="ml-1 text-[10px] text-slate-400">({response.mappingResults.length})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === 'body' && (
            <TabsContent value="body" forceMount className="h-full flex flex-col min-h-0 overflow-hidden m-0">
              {response.error ? (
                <div className="flex items-center justify-center flex-1 text-xs text-slate-400">
                  No response body
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-3 py-1 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                      {language}
                    </span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded p-0.5">
                      <button
                        onClick={() => setRawMode(false)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded transition-colors font-medium',
                          !rawMode
                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        )}
                      >
                        Pretty
                      </button>
                      <button
                        onClick={() => setRawMode(true)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded transition-colors font-medium',
                          rawMode
                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600'
                        )}
                      >
                        Raw
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-hidden">
                    {response.body === '' ? (
                      <div className="flex items-center justify-center h-full text-xs text-slate-400">
                        Empty response body
                      </div>
                    ) : rawMode ? (
                      <pre className="h-full overflow-auto p-3 text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-all bg-white dark:bg-slate-950">
                        {response.body}
                      </pre>
                    ) : (
                      <MonacoEditor
                        height="100%"
                        language={language}
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
                          domReadOnly: true,
                          renderLineHighlight: 'none'
                        }}
                      />
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          )}

          {activeTab === 'headers' && (
            <TabsContent value="headers" forceMount className="h-full overflow-y-auto m-0">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(response.headers).map(([key, value], idx) => (
                    <tr
                      key={key}
                      className={cn(
                        'border-b border-slate-50 dark:border-slate-900/80',
                        idx % 2 === 0
                          ? 'bg-white dark:bg-slate-950'
                          : 'bg-slate-50/50 dark:bg-slate-900/30'
                      )}
                    >
                      <td className="py-1.5 px-3 font-mono font-semibold text-slate-500 dark:text-slate-400 w-2/5 break-all align-top">
                        {key}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-slate-700 dark:text-slate-300 break-all">
                        {value}
                      </td>
                    </tr>
                  ))}
                  {Object.keys(response.headers).length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-6 px-3 text-center text-slate-400">
                        No response headers
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TabsContent>
          )}

          {activeTab === 'history' && (
            <TabsContent value="history" forceMount className="h-full overflow-y-auto m-0">
              {requestHistory.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-xs text-slate-400">
                  No history for this request
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <th className="py-1.5 px-3 text-left font-medium text-slate-500">Method</th>
                      <th className="py-1.5 px-3 text-left font-medium text-slate-500">URL</th>
                      <th className="py-1.5 px-3 text-left font-medium text-slate-500">Status</th>
                      <th className="py-1.5 px-3 text-left font-medium text-slate-500">Time</th>
                      <th className="py-1.5 px-3 text-left font-medium text-slate-500">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestHistory.map((h, idx) => (
                      <tr
                        key={h.id}
                        className={cn(
                          'border-b border-slate-50 dark:border-slate-900/80',
                          idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/50 dark:bg-slate-900/30',
                          'hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors'
                        )}
                      >
                        <td className="py-1.5 px-3">
                          <MethodBadge method={h.method} />
                        </td>
                        <td className="py-1.5 px-3 font-mono text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                          {h.url}
                        </td>
                        <td className="py-1.5 px-3">
                          <span className={cn(
                            'font-mono font-semibold',
                            h.status >= 200 && h.status < 300 ? 'text-green-600 dark:text-green-400' :
                            h.status >= 400 ? 'text-red-500 dark:text-red-400' : 'text-slate-500'
                          )}>
                            {h.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-slate-500 tabular-nums">{h.duration}ms</td>
                        <td className="py-1.5 px-3 text-slate-500 tabular-nums">{formatSize(h.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>
          )}

          {activeTab === 'tests' && (
            <TabsContent value="tests" forceMount className="h-full overflow-y-auto m-0">
              {response.testResults && response.testResults.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {response.testResults.map((result, index) => (
                    <div key={`${result.name}-${index}`} className="px-3 py-3 flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                        result.passed
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      )}>
                        <Beaker className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{result.name}</p>
                        <p className={cn(
                          'text-[11px] mt-1',
                          result.passed ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                        )}>
                          {result.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  No test results for this response
                </div>
              )}
            </TabsContent>
          )}

          {activeTab === 'console' && (
            <TabsContent value="console" forceMount className="h-full overflow-y-auto m-0 bg-slate-950">
              {response.consoleLogs && response.consoleLogs.length > 0 ? (
                <div className="divide-y divide-slate-800">
                  {response.consoleLogs.map((entry, index) => (
                    <div key={`${entry.phase}-${index}`} className="px-3 py-2 font-mono text-xs text-slate-200">
                      <div className="flex items-center gap-2 mb-1">
                        <TerminalSquare className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">{entry.phase}</span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-600">{entry.level}</span>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-slate-300">{entry.message}</pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  No console output for this response
                </div>
              )}
            </TabsContent>
          )}

          {activeTab === 'output' && (
            <TabsContent value="output" forceMount className="h-full overflow-y-auto m-0">
              {response.mappingResults && response.mappingResults.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {response.mappingResults.map((item, index) => (
                    <div key={`${item.variableName}-${index}`} className="px-3 py-3 flex items-start gap-3">
                      <div className={cn(
                        'mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0',
                        item.applied
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      )}>
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {item.variableName} <span className="text-slate-400 font-normal">from {item.sourcePath}</span>
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          {item.applied
                            ? `Saved to ${item.targetScope}${item.value ? ` = ${item.value}` : ''}`
                            : item.reason ?? 'Not applied'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  No response capture results for this response
                </div>
              )}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}

