

import { useCallback, useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openTab, closeTab, setTabDirty, renameTab, type EditorTab } from '@/features/workbench/workbenchSlice'
import { selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import { selectActiveScriptId, selectScriptItems, selectScriptsStatus } from '@/features/scripts/selectors'
import { closeActiveRequestEditor, setActiveRequest } from '@/features/api/apiSlice'
import { selectApiActiveRequestId, selectApiRequests, selectApiIsLoading } from '@/features/api/selectors'

export const scriptTabId = (id: string) => `script:${id}`
export const apiTabId = (id: string) => `api:${id}`

/**
 * The one UNSAVED api request draft (apiSlice.newRequest) gets a pseudo-tab so
 * it behaves like Postman's "Untitled Request": visible, switchable, always
 * dirty-dotted, converted into a real tab on first save.
 */
export const API_DRAFT_ENTITY_ID = '__draft__'
export const API_DRAFT_TAB_ID = apiTabId(API_DRAFT_ENTITY_ID)

/**
 * Close a tab with dirty confirm, keeping feature selection consistent so the
 * open-tab effects in useTabSync don't resurrect the closed tab. Shared by
 * EditorTabs (close button / middle-click) and the Ctrl+W shortcut.
 */
export function useRequestCloseTab() {
  const dispatch = useAppDispatch()
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  const activeScriptId = useAppSelector(selectActiveScriptId)
  const activeRequestId = useAppSelector(selectApiActiveRequestId)

  return useCallback((tab: EditorTab) => {
    if (tab.dirty && !window.confirm('Discard unsaved changes?')) return

    const idx = tabs.findIndex((t) => t.id === tab.id)
    if (idx === -1) return
    const remaining = tabs.filter((t) => t.id !== tab.id)
    const wasActive = activeTabId === tab.id
    // Mirror of closeTab reducer's neighbor pick
    const nextActive = wasActive
      ? remaining[Math.min(idx, remaining.length - 1)] ?? null
      : remaining.find((t) => t.id === activeTabId) ?? null

    dispatch(closeTab(tab.id))

    // Closing the draft pseudo-tab discards the draft itself — otherwise the
    // draft-lifecycle effect in useTabSync would immediately reopen the tab.
    if (tab.id === API_DRAFT_TAB_ID) {
      dispatch(closeActiveRequestEditor())
    }

    // Sync feature slices with the surviving active tab
    if (tab.kind === 'script' && tab.entityId === activeScriptId) {
      dispatch(setActiveScript(nextActive?.kind === 'script' ? nextActive.entityId : null))
    }
    if (tab.kind === 'api' && tab.entityId === activeRequestId) {
      if (nextActive?.kind === 'api') {
        dispatch(setActiveRequest(nextActive.entityId))
      } else {
        dispatch(closeActiveRequestEditor())
      }
    }
    // Activate the neighbor's entity when the closed tab was active
    if (wasActive && nextActive) {
      if (nextActive.kind === 'script' && nextActive.entityId !== activeScriptId) {
        dispatch(setActiveScript(nextActive.entityId))
      } else if (nextActive.kind === 'api' && nextActive.entityId !== activeRequestId) {
        dispatch(setActiveRequest(nextActive.entityId))
      }
    }
  }, [dispatch, tabs, activeTabId, activeScriptId, activeRequestId])
}

/**
 * Keeps workbench tabs in sync with the scripts/api feature slices:
 * - sidebar selection opens/focuses a tab
 * - unsaved api drafts appear as an "Untitled Request" pseudo-tab
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
  // An unsaved draft is an open api editor with no persisted id.
  const hasApiDraft = useAppSelector(
    (state) => state.api.activeRequest !== null && state.api.activeRequestId === null
  )
  const draftName = useAppSelector((state) =>
    state.api.activeRequestId === null ? state.api.activeRequest?.name ?? '' : ''
  )
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

  // (a) script selection → open/focus tab. Compares against the ACTIVE TAB
  // (not a "previous selection" ref) so re-selecting the same entity still
  // refocuses its tab. Clears a SAVED api selection (a stale id would make
  // re-selecting that request a Redux no-op and its tab would never refocus);
  // unsaved DRAFTS are deliberately preserved — their pseudo-tab keeps them
  // reachable, Postman-style.
  useEffect(() => {
    if (!activeScriptId) return
    const id = scriptTabId(activeScriptId)
    const exists = tabsRef.current.some((t) => t.id === id)
    if (!exists || activeTabIdRef.current !== id) {
      const title = scriptItems.find((s) => s.id === activeScriptId)?.name ?? 'Script'
      dispatch(openTab({ id, kind: 'script', entityId: activeScriptId, title }))
    }
    if (activeRequestIdRef.current) dispatch(closeActiveRequestEditor())
  }, [activeScriptId, scriptItems, dispatch])

  // (b) api selection → open/focus tab; mirror of (a).
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

  // (b2) draft lifecycle: newRequest() → open the pseudo-tab (always dirty);
  // saving or discarding the draft (hasApiDraft false) → close it. Saving also
  // sets activeRequestId, so (b) opens the real tab in the same pass.
  useEffect(() => {
    const exists = tabsRef.current.some((t) => t.id === API_DRAFT_TAB_ID)
    if (hasApiDraft) {
      const title = draftName.trim() || 'Untitled Request'
      if (!exists || activeTabIdRef.current !== API_DRAFT_TAB_ID) {
        dispatch(openTab({ id: API_DRAFT_TAB_ID, kind: 'api', entityId: API_DRAFT_ENTITY_ID, title }))
        dispatch(setTabDirty({ id: API_DRAFT_TAB_ID, dirty: true }))
      } else {
        const tab = tabsRef.current.find((t) => t.id === API_DRAFT_TAB_ID)
        if (tab && tab.title !== title) dispatch(renameTab({ id: API_DRAFT_TAB_ID, title }))
      }
      if (activeScriptIdRef.current && activeTabIdRef.current === API_DRAFT_TAB_ID) {
        dispatch(setActiveScript(null))
      }
    } else if (exists) {
      dispatch(closeTab(API_DRAFT_TAB_ID))
    }
  }, [hasApiDraft, draftName, dispatch])

  // (c) dirty sync — scripts only (apiSlice has no saved-vs-draft dirty flag;
  // the draft pseudo-tab is permanently dirty instead)
  useEffect(() => {
    if (!activeScriptId) return
    const id = scriptTabId(activeScriptId)
    const tab = tabsRef.current.find((t) => t.id === id)
    if (tab && tab.dirty !== scriptDirty) {
      dispatch(setTabDirty({ id, dirty: scriptDirty }))
    }
  }, [scriptDirty, activeScriptId, tabs, dispatch])

  // (d) rename sync (draft tab handled in (b2))
  useEffect(() => {
    for (const tab of tabsRef.current) {
      if (tab.id === API_DRAFT_TAB_ID) continue
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
  // status so it never fires while the lists are still empty/loading. The
  // draft pseudo-tab has no persisted entity and is managed by (b2) instead.
  useEffect(() => {
    for (const tab of tabs) {
      if (tab.id === API_DRAFT_TAB_ID) continue
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
  // the active tab. The draft pseudo-tab needs no dispatch — its state already
  // lives in apiSlice.activeRequest.
  useEffect(() => {
    const active = tabs.find((t) => t.id === activeTabId)
    if (!active || active.id === API_DRAFT_TAB_ID) return
    if (active.kind === 'script' && activeScriptIdRef.current !== active.entityId) {
      dispatch(setActiveScript(active.entityId))
    } else if (active.kind === 'api' && activeRequestIdRef.current !== active.entityId) {
      dispatch(setActiveRequest(active.entityId))
    }
  }, [activeTabId, tabs, dispatch])
}
