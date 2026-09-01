

import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveTab,
  type EditorTab,
} from '@/features/workbench/workbenchSlice'
import { selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import { selectActiveScriptId } from '@/features/scripts/selectors'
import { setActiveRequest, closeActiveRequestEditor } from '@/features/api/apiSlice'
import { selectApiActiveRequestId } from '@/features/api/selectors'
import { API_DRAFT_TAB_ID, useRequestCloseTab } from './tabSync'
import { FileCode2, Globe, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Tab list ↔ feature-slice sync lives in useTabSync (tabSync.ts), called from
// the always-mounted Home component — EditorTabs unmounts while the settings
// activity is active, so it must stay presentational.

export function EditorTabs() {
  const dispatch = useAppDispatch()
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  const activeScriptId = useAppSelector(selectActiveScriptId)
  const activeRequestId = useAppSelector(selectApiActiveRequestId)

  // Tab click → activate tab + matching feature selection. Also clears the
  // OTHER slice's selection so scripts/api can never both claim an active
  // editor (re-selecting an entity in the tree must always refocus its tab).
  const activateTab = (tab: EditorTab) => {
    if (activeTabId !== tab.id) dispatch(setActiveTab(tab.id))
    if (tab.kind === 'script') {
      if (tab.entityId !== activeScriptId) dispatch(setActiveScript(tab.entityId))
      // Saved api selections are cleared; the unsaved DRAFT is preserved so its
      // pseudo-tab stays switchable (its state lives in apiSlice.activeRequest).
      if (activeRequestId) dispatch(closeActiveRequestEditor())
    } else if (tab.id === API_DRAFT_TAB_ID) {
      // The draft's editor state is already in apiSlice.activeRequest — only
      // the script selection needs clearing so the api editor takes the area.
      if (activeScriptId) dispatch(setActiveScript(null))
    } else {
      if (tab.entityId !== activeRequestId) dispatch(setActiveRequest(tab.entityId))
      if (activeScriptId) dispatch(setActiveScript(null))
    }
  }

  // Close with dirty confirm + feature-slice sync — shared with the Ctrl+W
  // shortcut in WorkbenchShell (see useRequestCloseTab in tabSync.ts).
  const requestCloseTab = useRequestCloseTab()

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
