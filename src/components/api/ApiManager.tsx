'use client'

import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchApiCollections, fetchApiRequests, fetchApiHistory, newRequest } from '@/features/api/apiSlice'
import { ApiSidebar } from './ApiSidebar'
import { ApiRequestEditor } from './ApiRequestEditor'
import { ApiResponseViewer } from './ApiResponseViewer'
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
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 overflow-hidden">
        <ApiSidebar />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeRequest ? (
          <>
            {/* Request editor — top 55% */}
            <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 55%' }}>
              <ApiRequestEditor />
            </div>

            {/* Response viewer — bottom 45% */}
            <div className="flex flex-col overflow-hidden" style={{ flex: '0 0 45%' }}>
              <ApiResponseViewer />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
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
      </div>
    </div>
  )
}
