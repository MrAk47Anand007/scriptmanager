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

        {/* Sidebar panel */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
          <div className="h-full overflow-hidden">
            <ApiSidebar />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Main content panel */}
        <ResizablePanel defaultSize={78} minSize={40}>
          {activeRequest ? (
            <ResizablePanelGroup orientation="vertical" className="h-full">

              {/* Request editor */}
              <ResizablePanel defaultSize={55} minSize={30}>
                <div className="h-full overflow-hidden">
                  <ApiRequestEditor />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Response viewer */}
              <ResizablePanel defaultSize={45} minSize={25}>
                <div className="h-full overflow-hidden">
                  <ApiResponseViewer />
                </div>
              </ResizablePanel>

            </ResizablePanelGroup>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <Globe className="h-14 w-14 text-slate-200 dark:text-slate-700" />
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Select a request or create a new one
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">
                  Build and test HTTP requests without leaving ScriptManager
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => dispatch(newRequest())}
                className="gap-1.5"
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
