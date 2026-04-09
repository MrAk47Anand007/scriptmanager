'use client'

import { useEffect, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchApiCollections, fetchApiRequests, fetchApiHistory, fetchApiEnvironments, fetchApiGlobals, fetchApiCollectionRuns, newRequest } from '@/features/api/apiSlice'
import { ApiSidebar } from './ApiSidebar'
import { ApiRequestEditor } from './ApiRequestEditor'
import { ApiResponseViewer } from './ApiResponseViewer'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Globe, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ApiManager() {
  const dispatch = useAppDispatch()
  const { activeRequestId, activeRequest, collections, requests, history, collectionRuns, environments, isLoading, isRunningCollection, error } = useAppSelector(s => s.api)

  useEffect(() => {
    dispatch(fetchApiCollections())
    dispatch(fetchApiRequests())
    dispatch(fetchApiHistory())
    dispatch(fetchApiCollectionRuns())
    dispatch(fetchApiEnvironments())
    dispatch(fetchApiGlobals())
  }, [dispatch])

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
