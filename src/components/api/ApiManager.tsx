'use client'

import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchApiCollections, fetchApiRequests, fetchApiHistory, newRequest } from '@/features/api/apiSlice'
import { ApiSidebar } from './ApiSidebar'
import { ApiRequestEditor } from './ApiRequestEditor'
import { ApiResponseViewer } from './ApiResponseViewer'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { Globe, Plus } from 'lucide-react'

export function ApiManager() {
  const dispatch = useAppDispatch()
  const { activeRequest } = useAppSelector(s => s.api)

  useEffect(() => {
    dispatch(fetchApiCollections())
    dispatch(fetchApiRequests())
    dispatch(fetchApiHistory())
  }, [dispatch])

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
          {activeRequest ? (
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
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
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
            </div>
          )}
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  )
}
