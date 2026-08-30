'use client'

import { memo } from 'react'
import { Clock } from 'lucide-react'
import type { Build } from '@/features/scripts/scriptsSlice'
import { cn } from '@/lib/utils'

export const BuildHistorySection = memo(function BuildHistorySection({
  builds,
  desktopRuntime = false,
  onBuildClick,
}: {
  builds: Build[]
  desktopRuntime?: boolean
  onBuildClick: (buildId: string) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2 border-b dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 overflow-hidden">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="truncate flex-1 min-w-0">{desktopRuntime ? 'Build History · Local' : 'Build History'}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {builds.length === 0 && <div className="p-4 text-xs text-slate-400 text-center italic">No builds yet</div>}
        {builds.map((build, index) => (
          <div
            key={build.id}
            className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors"
            onClick={() => onBuildClick(build.id)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">#{builds.length - index}</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full uppercase tracking-wide",
                build.status === 'success' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                  build.status === 'failure' ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                    build.status === 'timeout' ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400" :
                      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
              )}>{build.status}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{new Date(build.started_at).toLocaleTimeString()}</span>
              <span>{build.triggered_by}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
