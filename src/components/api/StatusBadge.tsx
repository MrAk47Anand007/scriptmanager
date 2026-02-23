'use client'

import { cn } from '@/lib/utils'

function getStatusColors(status: number): string {
  if (status >= 200 && status < 300) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
  }
  if (status >= 300 && status < 400) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
  }
  if (status >= 400 && status < 500) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
  }
  if (status >= 500) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
}

interface StatusBadgeProps {
  status: number
  statusText?: string
  className?: string
}

export function StatusBadge({ status, statusText, className }: StatusBadgeProps) {
  const colors = getStatusColors(status)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-semibold text-sm px-2 py-1 rounded',
        colors,
        className
      )}
    >
      <span className="text-base font-bold">{status}</span>
      {statusText && <span className="font-normal text-xs opacity-80">{statusText}</span>}
    </span>
  )
}
