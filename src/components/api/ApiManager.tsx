'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchApiCollections, fetchApiRequests, fetchApiHistory, fetchApiEnvironments, fetchApiGlobals, fetchApiCollectionRuns, newRequest, setActiveRequest, closeActiveRequestEditor } from '@/features/api/apiSlice'
import { ApiSidebar } from './ApiSidebar'
import { ApiRequestEditor } from './ApiRequestEditor'
import { ApiResponseViewer } from './ApiResponseViewer'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Globe, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type RequestTab = {
  key: string
  requestId: string | null
  title: string
  draft: boolean
}

export function ApiManager() {
  const dispatch = useAppDispatch()
  const { activeRequestId, activeRequest, collections, requests, history, collectionRuns, environments, isLoading, isRunningCollection, error } = useAppSelector(s => s.api)
  const [openTabs, setOpenTabs] = useState<RequestTab[]>([])

  useEffect(() => {
    dispatch(fetchApiCollections())
    dispatch(fetchApiRequests())
    dispatch(fetchApiHistory())
    dispatch(fetchApiCollectionRuns())
    dispatch(fetchApiEnvironments())
    dispatch(fetchApiGlobals())
  }, [dispatch])

  useEffect(() => {
    if (activeRequestId) {
      setOpenTabs((current) => {
        const request = requests.find((item) => item.id === activeRequestId)
        const title = request?.name ?? activeRequest?.name ?? 'Request'
        const draftIndex = current.findIndex((tab) => tab.draft)
        const existingIndex = current.findIndex((tab) => tab.key === activeRequestId)

        if (existingIndex !== -1) {
          const next = [...current]
          next[existingIndex] = { ...next[existingIndex], title, requestId: activeRequestId, draft: false }
          return next
        }

        if (draftIndex !== -1) {
          const next = [...current]
          next[draftIndex] = { key: activeRequestId, requestId: activeRequestId, title, draft: false }
          return next
        }

        return [...current, { key: activeRequestId, requestId: activeRequestId, title, draft: false }]
      })
      return
    }

    if (activeRequest) {
      setOpenTabs((current) => {
        const title = activeRequest.name?.trim() || 'New Request'
        const existingIndex = current.findIndex((tab) => tab.draft)
        if (existingIndex !== -1) {
          const next = [...current]
          next[existingIndex] = { ...next[existingIndex], title }
          return next
        }
        return [...current, { key: 'draft', requestId: null, title, draft: true }]
      })
    }
  }, [activeRequestId, activeRequest, requests])

  useEffect(() => {
    setOpenTabs((current) =>
      current
        .filter((tab) => tab.draft || requests.some((request) => request.id === tab.requestId))
        .map((tab) => {
          if (tab.draft) {
            return activeRequest && !activeRequestId
              ? { ...tab, title: activeRequest.name?.trim() || 'New Request' }
              : tab
          }
          const request = requests.find((item) => item.id === tab.requestId)
          return request ? { ...tab, title: request.name } : tab
        })
    )
  }, [requests, activeRequest, activeRequestId])

  const handleActivateTab = (tab: RequestTab) => {
    if (tab.requestId) {
      dispatch(setActiveRequest(tab.requestId))
      return
    }
    dispatch(newRequest(activeRequest ?? undefined))
  }

  const handleCloseTab = (tabKey: string) => {
    setOpenTabs((current) => {
      const index = current.findIndex((tab) => tab.key === tabKey)
      if (index === -1) return current

      const closingTab = current[index]
      const nextTabs = current.filter((tab) => tab.key !== tabKey)
      const isActive = closingTab.requestId
        ? closingTab.requestId === activeRequestId
        : !activeRequestId && Boolean(activeRequest)

      if (isActive) {
        const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? null
        if (fallback) {
          if (fallback.requestId) {
            dispatch(setActiveRequest(fallback.requestId))
          } else {
            dispatch(newRequest(activeRequest ?? undefined))
          }
        } else {
          dispatch(closeActiveRequestEditor())
        }
      }

      return nextTabs
    })
  }

  const hasWorkspaceData = collections.length > 0 || requests.length > 0 || history.length > 0 || collectionRuns.length > 0 || environments.length > 0
  const workspaceFeedback = useMemo(() => {
    if (error) {
      return {
        tone: 'error' as const,
        message: error,
      }
    }

    if (isRunningCollection) {
      return {
        tone: 'info' as const,
        message: 'Running collection and waiting for results...',
      }
    }

    if (isLoading && !hasWorkspaceData) {
      return {
        tone: 'info' as const,
        message: 'Loading API workspace...',
      }
    }

    if (isLoading) {
      return {
        tone: 'info' as const,
        message: 'Refreshing API workspace data...',
      }
    }

    return null
  }, [error, hasWorkspaceData, isLoading, isRunningCollection])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <ResizablePanel defaultSize={25} minSize={18} maxSize={42}>
          <div className="h-full overflow-hidden">
            <ApiSidebar />
          </div>
        </ResizablePanel>

        {/* Horizontal drag handle — separates sidebar from main content */}
        <ResizableHandle withHandle orientation="horizontal" />

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <ResizablePanel defaultSize={75} minSize={40}>
          {activeRequestId || activeRequest ? (
            <div className="flex h-full flex-col overflow-hidden">
              {openTabs.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 px-2 py-1.5 shrink-0">
                  {openTabs.map((tab) => {
                    const active = tab.requestId ? tab.requestId === activeRequestId : !activeRequestId && Boolean(activeRequest)
                    return (
                      <div
                        key={tab.key}
                        className={cn(
                          'group flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs min-w-0 max-w-[220px] cursor-pointer transition-colors',
                          active
                            ? 'border-blue-500/40 bg-white text-slate-900 dark:border-blue-500/50 dark:bg-slate-950 dark:text-slate-100'
                            : 'border-slate-200 bg-slate-100/80 text-slate-500 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:text-slate-200'
                        )}
                        onClick={() => handleActivateTab(tab)}
                      >
                        <span className="truncate">{tab.title}</span>
                        <button
                          className="h-4 w-4 shrink-0 rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleCloseTab(tab.key)
                          }}
                        >
                          <X className="h-3 w-3 mx-auto" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {workspaceFeedback && (
                <div
                  className={cn(
                    'flex items-center gap-2 border-b px-3 py-2 text-xs shrink-0',
                    workspaceFeedback.tone === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'
                  )}
                >
                  {workspaceFeedback.tone === 'error' ? (
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  )}
                  <span>{workspaceFeedback.message}</span>
                </div>
              )}
              <ResizablePanelGroup orientation="vertical" className="h-full">

                {/* Request editor */}
                <ResizablePanel defaultSize={55} minSize={28}>
                  <div className="h-full overflow-hidden">
                    <ApiRequestEditor />
                  </div>
                </ResizablePanel>

                {/* Vertical drag handle — separates editor from response */}
                <ResizableHandle withHandle orientation="vertical" />

                {/* Response viewer */}
                <ResizablePanel defaultSize={45} minSize={22}>
                  <div className="h-full overflow-hidden">
                    <ApiResponseViewer />
                  </div>
                </ResizablePanel>

              </ResizablePanelGroup>
            </div>
          ) : (
            /* Empty state */
            <div className="flex h-full flex-col overflow-hidden">
              {workspaceFeedback && (
                <div
                  className={cn(
                    'flex items-center gap-2 border-b px-3 py-2 text-xs shrink-0',
                    workspaceFeedback.tone === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'
                  )}
                >
                  {workspaceFeedback.tone === 'error' ? (
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  )}
                  <span>{workspaceFeedback.message}</span>
                </div>
              )}
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8">
                {isLoading && !hasWorkspaceData ? (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Loading requests and collections
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Preparing your API workspace...
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center">
                      <Globe className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        No request selected
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Pick a saved request or start a new one
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => dispatch(newRequest())}
                      className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" />
                      New Request
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  )
}
