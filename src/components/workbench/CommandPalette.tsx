'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { FileCode2, Globe, Terminal as TerminalIcon } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveActivity, setActiveDockTab, setPaletteOpen, toggleDock,
} from '@/features/workbench/workbenchSlice'
import { selectPaletteOpen } from '@/features/workbench/selectors'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import { selectActiveScriptId, selectScriptItems } from '@/features/scripts/selectors'
import { newRequest, setActiveRequest } from '@/features/api/apiSlice'
import { selectApiRequests } from '@/features/api/selectors'
import { cn } from '@/lib/utils'

interface PaletteItem {
  id: string
  group: 'Commands' | 'Scripts' | 'API Requests'
  label: string
  detail?: string
  shortcut?: string
  run: () => void
}

/** Simple subsequence fuzzy match (VS Code-ish): all query chars appear in order. */
function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  for (const ch of q) {
    ti = t.indexOf(ch, ti)
    if (ti === -1) return false
    ti += 1
  }
  return true
}

const MAX_RESULTS = 12

/**
 * Global command palette (Ctrl+P / Ctrl+K). Always mounted once in
 * WorkbenchShell; open state lives in workbenchSlice.paletteOpen.
 * `>` prefix filters to commands only (VS Code convention).
 */
export function CommandPalette() {
  const dispatch = useAppDispatch()
  const open = useAppSelector(selectPaletteOpen)
  const scripts = useAppSelector(selectScriptItems)
  const requests = useAppSelector(selectApiRequests)
  const activeScriptId = useAppSelector(selectActiveScriptId)
  const { resolvedTheme, setTheme } = useTheme()

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => dispatch(setPaletteOpen(false))

  const commands = useMemo<PaletteItem[]>(() => [
    {
      id: 'cmd:new-script', group: 'Commands', label: 'New Script',
      run: () => { dispatch(setActiveActivity('scripts')); window.dispatchEvent(new CustomEvent('scriptmanager:new-script')) },
    },
    {
      id: 'cmd:new-api-request', group: 'Commands', label: 'New API Request',
      run: () => { dispatch(setActiveActivity('api')); dispatch(newRequest(undefined)) },
    },
    {
      id: 'cmd:run-active-script', group: 'Commands', label: 'Run Active Script', shortcut: 'Ctrl+Enter',
      run: () => {
        if (!activeScriptId) return
        window.dispatchEvent(new CustomEvent('scriptmanager:run-active-script'))
      },
    },
    {
      id: 'cmd:toggle-terminal', group: 'Commands', label: 'Toggle Terminal',
      run: () => dispatch(setActiveDockTab('terminal')),
    },
    {
      id: 'cmd:toggle-dock', group: 'Commands', label: 'Toggle Dock', shortcut: 'Ctrl+`',
      run: () => dispatch(toggleDock()),
    },
    {
      id: 'cmd:go-scripts', group: 'Commands', label: 'Go to Scripts',
      run: () => dispatch(setActiveActivity('scripts')),
    },
    {
      id: 'cmd:go-api', group: 'Commands', label: 'Go to API',
      run: () => dispatch(setActiveActivity('api')),
    },
    {
      id: 'cmd:go-schedules', group: 'Commands', label: 'Go to Schedules',
      run: () => dispatch(setActiveActivity('schedules')),
    },
    {
      id: 'cmd:go-settings', group: 'Commands', label: 'Go to Settings',
      run: () => dispatch(setActiveActivity('settings')),
    },
    {
      id: 'cmd:toggle-theme', group: 'Commands', label: 'Toggle Theme',
      run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    },
  ], [dispatch, activeScriptId, resolvedTheme, setTheme])

  const results = useMemo<PaletteItem[]>(() => {
    const commandsOnly = query.startsWith('>')
    const q = (commandsOnly ? query.slice(1) : query).trim()

    const matchedCommands = q ? commands.filter((c) => fuzzyMatch(c.label, q)) : commands
    if (commandsOnly) return matchedCommands.slice(0, MAX_RESULTS)

    const matchedScripts: PaletteItem[] = scripts
      .filter((s) => !q || fuzzyMatch(s.name, q) || fuzzyMatch(s.description ?? '', q))
      .map((s) => ({
        id: `script:${s.id}`, group: 'Scripts' as const, label: s.name,
        detail: s.language || undefined,
        run: () => { dispatch(setActiveActivity('scripts')); dispatch(setActiveScript(s.id)) },
      }))

    const matchedRequests: PaletteItem[] = requests
      .filter((r) => !q || fuzzyMatch(r.name, q))
      .map((r) => ({
        id: `api:${r.id}`, group: 'API Requests' as const, label: r.name,
        detail: r.method,
        run: () => { dispatch(setActiveActivity('api')); dispatch(setActiveRequest(r.id)) },
      }))

    return [...matchedCommands, ...matchedScripts, ...matchedRequests].slice(0, MAX_RESULTS)
  }, [query, commands, scripts, requests, dispatch])

  // Reset + focus when opened; reset cursor on query change
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])
  useEffect(() => { setCursor(0) }, [query])

  // Keep the selected row visible
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
    item?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const runItem = (item: PaletteItem) => {
    close()
    item.run()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[cursor]) runItem(results[cursor])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const iconFor = (item: PaletteItem) => {
    if (item.group === 'Scripts') return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    if (item.group === 'API Requests') return <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    return <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }

  let lastGroup: string | null = null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="wb-transition w-full max-w-xl animate-in fade-in zoom-in-95 duration-[130ms] overflow-hidden rounded-lg border border-wb-border bg-popover text-popover-foreground shadow-2xl">
        <div className="flex items-center gap-2 border-b border-wb-border px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands, scripts and requests… (type > for commands)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-wb-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No results</div>
          )}
          {results.map((item, i) => {
            const showHeader = item.group !== lastGroup
            lastGroup = item.group
            const selected = i === cursor
            return (
              <div key={item.id}>
                {showHeader && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.group}
                  </div>
                )}
                <div
                  data-index={i}
                  className={cn(
                    'wb-transition relative flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px]',
                    selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  )}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={(e) => { e.preventDefault(); runItem(item) }}
                >
                  {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-brand" />}
                  {iconFor(item)}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.detail && (
                    <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{item.detail}</span>
                  )}
                  {item.shortcut && (
                    <kbd className="shrink-0 rounded border border-wb-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-wb-border px-3 py-1.5 text-[10px] text-muted-foreground">
          <span><kbd className="rounded border border-wb-border bg-muted px-1 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-wb-border bg-muted px-1 py-0.5">↵</kbd> run</span>
          <span><kbd className="rounded border border-wb-border bg-muted px-1 py-0.5">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
