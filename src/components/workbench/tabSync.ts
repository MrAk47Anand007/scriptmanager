'use client'

import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openTab, closeTab, setTabDirty, renameTab } from '@/features/workbench/workbenchSlice'
import { selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import { selectActiveScriptId, selectScriptItems, selectScriptsStatus } from '@/features/scripts/selectors'
import { closeActiveRequestEditor, setActiveRequest } from '@/features/api/apiSlice'
import { selectApiActiveRequestId, selectApiRequests, selectApiIsLoading } from '@/features/api/selectors'

export const scriptTabId = (id: string) => `script:${id}`
export const apiTabId = (id: string) => `api:${id}`

/**
 * Keeps workbench tabs in sync with the scripts/api feature slices:
 * - sidebar selection opens/focuses a tab (and enforces mutual exclusion
 *   between the script and api selections)
 * - dirty + rename state mirrored into tabs
 * - tabs whose entity was deleted are closed
 *
 * Must be called from an ALWAYS-MOUNTED component (Home in page.tsx) — if it
 * lived in EditorTabs it would unmount while the settings activity is active,
 * suspending sync.
 */
export function useTabSync() {
  const dispatch = useAppDispatch()
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  const activeScriptId = useAppSelector(selectActiveScriptId)
  const scriptItems = useAppSelector(selectScriptItems)
  const scriptsStatus = useAppSelector(selectScriptsStatus)
  const activeRequestId = useAppSelector(selectApiActiveRequestId)
  const requests = useAppSelector(selectApiRequests)
  const apiIsLoading = useAppSelector(selectApiIsLoading)
  // True for saved requests AND unsaved drafts (newRequest() — id is null).
  const apiEditorOpen = useAppSelector((state) => state.api.activeRequest !== null)
  // Same dirty detection ScriptTree's UnsavedIndicator uses: editor buffer vs saved content
  const scriptDirty = useAppSelector((state) => {
    const id = state.scripts.activeScriptId
    if (!id) return false
    const script = state.scripts.items.find((s) => s.id === id)
    if (!script) return false
    return (script.content || '') !== (state.scripts.activeScriptContent || '')
  })

  // Refs so the selection effects react only to SELECTION changes, not
  // tab-list changes (prevents re-focus loops after closing a tab whose
  // entity is still feature-active).
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId
  const activeScriptIdRef = useRef(activeScriptId)
  activeScriptIdRef.current = activeScriptId
  const activeRequestIdRef = useRef(activeRequestId)
  activeRequestIdRef.current = activeRequestId
  const apiEditorOpenRef = useRef(apiEditorOpen)
  apiEditorOpenRef.current = apiEditorOpen

  // (a) script selection → open/focus tab. Compares against the ACTIVE TAB
  // (not a "previous selection" ref) so re-selecting the same entity still
  // refocuses its tab. Also clears the api selection — the script and api
  // slices must never both claim an active editor (see issue with stale
  // selection short-circuiting tab focus).
  useEffect(() => {
    if (!activeScriptId) return
    const id = scriptTabId(activeScriptId)
    const exists = tabsRef.current.some((t) => t.id === id)
    if (!exists || activeTabIdRef.current !== id) {
      const title = scriptItems.find((s) => s.id === activeScriptId)?.name ?? 'Script'
      dispatch(openTab({ id, kind: 'script', entityId: activeScriptId, title }))
    }
    // Close any open api editor — including unsaved DRAFTS (activeRequestId is
    // null for those, so checking only the id would leave the draft trumping
    // the editor-kind resolution in page.tsx forever.
    if (apiEditorOpenRef.current) dispatch(closeActiveRequestEditor())
  }, [activeScriptId, scriptItems, dispatch])

  // (b) api selection → open/focus tab; mirror of (a). Also clears the script
  // selection so the slices stay mutually exclusive regardless of entry point
  // (sidebar click, tab click, or QuickSwitcher) — a stale script selection
  // would make re-selecting that script a Redux no-op and the tab would never
  // refocus.
  useEffect(() => {
    if (!activeRequestId) return
    const id = apiTabId(activeRequestId)
    const exists = tabsRef.current.some((t) => t.id === id)
    if (!exists || activeTabIdRef.current !== id) {
      const title = requests.find((r) => r.id === activeRequestId)?.name ?? 'Request'
      dispatch(openTab({ id, kind: 'api', entityId: activeRequestId, title }))
    }
    if (activeScriptIdRef.current) dispatch(setActiveScript(null))
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

  // The api requests list starts empty and only loads after the api workspace
  // mounts — remember once it has produced data so the zombie sweep below
  // doesn't treat "not loaded yet" as "deleted".
  const apiEverLoadedRef = useRef(false)
  if (requests.length > 0) apiEverLoadedRef.current = true

  // (e) zombie sweep — close tabs whose entity was deleted. Guarded on load
  // status so it never fires while the lists are still empty/loading.
  useEffect(() => {
    for (const tab of tabs) {
      const gone = tab.kind === 'script'
        ? scriptsStatus === 'succeeded' && !scriptItems.some((s) => s.id === tab.entityId)
        : apiEverLoadedRef.current && !apiIsLoading && !requests.some((r) => r.id === tab.entityId)
      if (gone) dispatch(closeTab(tab.id))
    }
  }, [tabs, scriptItems, scriptsStatus, requests, apiIsLoading, dispatch])

  // (f) reconcile feature selection with the active tab. Covers tab activations
  // that don't go through EditorTabs' click handler — e.g. the zombie sweep
  // closing the active tab makes the reducer activate a neighbor, but nothing
  // else would tell the scripts/api slice to show that neighbor's editor.
  // Loop-safe: effects (a)/(b) no-op when the selected entity's tab is already
  // the active tab.
  useEffect(() => {
    const active = tabs.find((t) => t.id === activeTabId)
    if (!active) return
    if (active.kind === 'script' && activeScriptIdRef.current !== active.entityId) {
      dispatch(setActiveScript(active.entityId))
    } else if (active.kind === 'api' && activeRequestIdRef.current !== active.entityId) {
      dispatch(setActiveRequest(active.entityId))
    }
  }, [activeTabId, tabs, dispatch])
}
