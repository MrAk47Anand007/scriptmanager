'use client'

import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  openTab, closeTab, setActiveTab, setTabDirty, renameTab,
  type EditorTab,
} from '@/features/workbench/workbenchSlice'
import { selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import { selectActiveScriptId, selectScriptItems } from '@/features/scripts/selectors'
import { setActiveRequest, closeActiveRequestEditor } from '@/features/api/apiSlice'
import { selectApiActiveRequestId, selectApiRequests } from '@/features/api/selectors'
import { FileCode2, Globe, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const scriptTabId = (id: string) => `script:${id}`
const apiTabId = (id: string) => `api:${id}`

/**
 * Keeps workbench tabs in sync with the scripts/api feature slices:
 * - sidebar selection opens/focuses a tab
 * - dirty + rename state mirrored into tabs
 * Returns handlers for tab activation and close.
 */
export function useTabSync() {
  const dispatch = useAppDispatch()
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  const activeScriptId = useAppSelector(selectActiveScriptId)
  const scriptItems = useAppSelector(selectScriptItems)
  const activeRequestId = useAppSelector(selectApiActiveRequestId)
  const requests = useAppSelector(selectApiRequests)
  // Same dirty detection ScriptTree's UnsavedIndicator uses: editor buffer vs saved content
  const scriptDirty = useAppSelector((state) => {
    const id = state.scripts.activeScriptId
    if (!id) return false
    const script = state.scripts.items.find((s) => s.id === id)
    if (!script) return false
    return (script.content || '') !== (state.scripts.activeScriptContent || '')
  })

  // Refs so effects react only to SELECTION changes, not tab-list changes
  // (prevents re-focus loops after closing a tab whose entity is still feature-active).
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const prevScriptIdRef = useRef<string | null>(null)
  const prevRequestIdRef = useRef<string | null>(null)

  // (a) sidebar selection → open/focus tab
  useEffect(() => {
    if (activeScriptId === prevScriptIdRef.current) return
    prevScriptIdRef.current = activeScriptId
    if (!activeScriptId) return
    const id = scriptTabId(activeScriptId)
    const exists = tabsRef.current.some((t) => t.id === id)
    if (exists && activeTabIdRef.current === id) return // idempotent: already open + active
    const title = scriptItems.find((s) => s.id === activeScriptId)?.name ?? 'Script'
    dispatch(openTab({ id, kind: 'script', entityId: activeScriptId, title }))
  }, [activeScriptId, scriptItems, dispatch])

  useEffect(() => {
    if (activeRequestId === prevRequestIdRef.current) return
    prevRequestIdRef.current = activeRequestId
    if (!activeRequestId) return
    const id = apiTabId(activeRequestId)
    const exists = tabsRef.current.some((t) => t.id === id)
    if (exists && activeTabIdRef.current === id) return
    const title = requests.find((r) => r.id === activeRequestId)?.name ?? 'Request'
    dispatch(openTab({ id, kind: 'api', entityId: activeRequestId, title }))
  }, [activeRequestId, requests, dispatch])

  // (c) dirty sync — scripts only (apiSlice has no saved-vs-draft dirty flag; skipped)
  useEffect(() => {
    if (!activeScriptId) return
    const id = scriptTabId(activeScriptId)
    const tab = tabsRef.current.find((t) => t.id === id)
    if (tab && tab.dirty !== scriptDirty) {
      dispatch(setTabDirty({ id, dirty: scriptDirty }))
    }
  }, [scriptDirty, activeScriptId, tabs, dispatch])

  // (d) rename sync
  useEffect(() => {
    for (const tab of tabsRef.current) {
      const name = tab.kind === 'script'
        ? scriptItems.find((s) => s.id === tab.entityId)?.name
        : requests.find((r) => r.id === tab.entityId)?.name
      if (name && name !== tab.title) {
        dispatch(renameTab({ id: tab.id, title: name }))
      }
    }
  }, [scriptItems, requests, tabs, dispatch])

  // (b) tab click → activate tab + matching feature selection
  const activateTab = (tab: EditorTab) => {
    if (activeTabIdRef.current !== tab.id) dispatch(setActiveTab(tab.id))
    if (tab.kind === 'script') {
      if (tab.entityId !== activeScriptId) dispatch(setActiveScript(tab.entityId))
    } else {
      if (tab.entityId !== activeRequestId) dispatch(setActiveRequest(tab.entityId))
    }
  }

  // (e)+(f) close with dirty confirm; keep feature selection consistent
  const requestCloseTab = (tab: EditorTab) => {
    if (tab.dirty && !window.confirm('Discard unsaved changes?')) return

    const current = tabsRef.current
    const idx = current.findIndex((t) => t.id === tab.id)
    const remaining = current.filter((t) => t.id !== tab.id)
    const wasActive = activeTabIdRef.current === tab.id
    // Mirror of closeTab reducer's neighbor pick
    const nextActive = wasActive
      ? remaining[Math.min(idx, remaining.length - 1)] ?? null
      : remaining.find((t) => t.id === activeTabIdRef.current) ?? null

    dispatch(closeTab(tab.id))

    // Sync feature slices so the open-tab effects don't resurrect the closed tab
    if (tab.kind === 'script' && tab.entityId === activeScriptId) {
      prevScriptIdRef.current = nextActive?.kind === 'script' ? nextActive.entityId : null
      dispatch(setActiveScript(nextActive?.kind === 'script' ? nextActive.entityId : null))
    }
    if (tab.kind === 'api' && tab.entityId === activeRequestId) {
      if (nextActive?.kind === 'api') {
        prevRequestIdRef.current = nextActive.entityId
        dispatch(setActiveRequest(nextActive.entityId))
      } else {
        prevRequestIdRef.current = null
        dispatch(closeActiveRequestEditor())
      }
    }
    // Activate the neighbor's entity when the closed tab was active
    if (wasActive && nextActive) {
      if (nextActive.kind === 'script' && nextActive.entityId !== activeScriptId) {
        prevScriptIdRef.current = nextActive.entityId
        dispatch(setActiveScript(nextActive.entityId))
      } else if (nextActive.kind === 'api' && nextActive.entityId !== activeRequestId) {
        prevRequestIdRef.current = nextActive.entityId
        dispatch(setActiveRequest(nextActive.entityId))
      }
    }
  }

  return { tabs, activeTabId, activateTab, requestCloseTab }
}

export function EditorTabs() {
  const { tabs, activeTabId, activateTab, requestCloseTab } = useTabSync()

  if (tabs.length === 0) return null

  return (
    <div
      className="flex h-[35px] shrink-0 items-stretch overflow-x-auto border-b border-wb-border bg-wb-sidepanel [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        const Icon = tab.kind === 'script' ? FileCode2 : Globe
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.title}
            className={cn(
              'wb-transition group relative -mb-px flex min-w-0 cursor-pointer select-none items-center gap-1.5 border-r border-wb-border px-3 text-xs',
              active
                ? 'bg-background text-foreground'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => activateTab(tab)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                requestCloseTab(tab)
              }
            }}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[24ch] truncate">{tab.title}</span>
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              {tab.dirty && (
                <span className="text-accent-brand group-hover:hidden" aria-label="Unsaved changes">●</span>
              )}
              <button
                className="wb-transition absolute inset-0 hidden items-center justify-center rounded hover:bg-muted group-hover:flex"
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  requestCloseTab(tab)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}
