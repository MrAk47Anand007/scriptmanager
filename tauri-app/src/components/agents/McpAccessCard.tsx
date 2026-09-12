import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, LoaderCircle, Plug, RefreshCw } from 'lucide-react'
import {
  getMcpStatusRuntime,
  installMcpConfigRuntime,
  type McpStatusRuntime,
} from '@/lib/agentRuntimeClient'

function copyToClipboard(text: string) {
  if (window.scriptManagerDesktop?.copyText) {
    void window.scriptManagerDesktop.copyText(text)
    return Promise.resolve()
  }
  return navigator.clipboard.writeText(text)
}

/**
 * "AI Access" card: exposes the built-in MCP stdio server to the user so any
 * MCP client (Claude Desktop, Codex, Zed, …) can use saved workflows, scripts,
 * and API requests as tools. One-click install edits the client's config file;
 * copy buttons cover manual setups.
 */
export function McpAccessCard() {
  const [status, setStatus] = useState<McpStatusRuntime | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [busyTarget, setBusyTarget] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setStatus(await getMcpStatusRuntime())
    } catch {
      // MCP status needs the desktop bridge; hide the card content otherwise.
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const install = async (target: 'claude-desktop' | 'codex') => {
    setError(null)
    setMessage(null)
    setBusyTarget(target)
    try {
      const result = await installMcpConfigRuntime(target)
      setMessage(result.message)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setBusyTarget(null)
    }
  }

  const copy = async (key: string, text: string) => {
    await copyToClipboard(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  if (!status) {
    return null
  }

  const claudeSnippet = JSON.stringify(status.claudeDesktopSnippet, null, 2)

  return (
    <div className="rounded-lg border border-accent-brand/25 bg-accent-brand/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-foreground">
          <Plug className="h-3.5 w-3.5 shrink-0 text-accent-brand" />
          AI Access (MCP)
          <span className="flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground">
            · {status.claudeDesktopInstalled && status.codexInstalled
              ? 'installed in Claude & Codex'
              : status.claudeDesktopInstalled
              ? 'installed in Claude Desktop'
              : status.codexInstalled
              ? 'installed in Codex'
              : 'connect your AI apps'}
          </span>
        </span>
        <RefreshCw className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-accent-brand/20 px-2.5 py-2.5">
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            ScriptManager ships a built-in MCP server. AI agents can then ask to run
            workflows, scripts, and API requests on your command — nothing runs by itself.
          </p>

          <div className="flex gap-1.5">
            <button
              onClick={() => void install('claude-desktop')}
              disabled={busyTarget !== null}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent-brand px-2 py-1.5 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busyTarget === 'claude-desktop'
                ? <LoaderCircle className="h-3 w-3 animate-spin" />
                : status.claudeDesktopInstalled
                ? <Check className="h-3 w-3" />
                : <Download className="h-3 w-3" />}
              Claude Desktop
            </button>
            <button
              onClick={() => void install('codex')}
              disabled={busyTarget !== null}
              className="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent-brand px-2 py-1.5 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busyTarget === 'codex'
                ? <LoaderCircle className="h-3 w-3 animate-spin" />
                : status.codexInstalled
                ? <Check className="h-3 w-3" />
                : <Download className="h-3 w-3" />}
              Codex CLI
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void copy('claude', claudeSnippet)}
              className="flex items-center gap-1 rounded-md border border-wb-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {copied === 'claude' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              Copy Claude JSON
            </button>
            <button
              onClick={() => void copy('codex', status.codexSnippetToml)}
              className="flex items-center gap-1 rounded-md border border-wb-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {copied === 'codex' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              Copy Codex TOML
            </button>
          </div>

          {status.claudeDesktopConfigPath && (
            <p className="truncate font-mono text-[9.5px] text-muted-foreground" title={status.claudeDesktopConfigPath}>
              Claude: {status.claudeDesktopConfigPath}
            </p>
          )}
          {status.codexConfigPath && (
            <p className="truncate font-mono text-[9.5px] text-muted-foreground" title={status.codexConfigPath}>
              Codex: {status.codexConfigPath}
            </p>
          )}
          <p className="truncate font-mono text-[9.5px] text-muted-foreground" title={`${status.exePath} ${status.args.join(' ')}`}>
            Server: {status.exePath} {status.args.join(' ')}
          </p>

          {message && <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400">{message}</p>}
          {error && <p className="text-[10.5px] text-rose-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
