'use client'

import { cn } from '@/lib/utils'

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  POST: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  PATCH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  HEAD: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  OPTIONS: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

interface MethodBadgeProps {
  method: string
  className?: string
  small?: boolean
}

export function MethodBadge({ method, className, small }: MethodBadgeProps) {
  const colors = METHOD_COLORS[method.toUpperCase()] ?? METHOD_COLORS.OPTIONS

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-semibold rounded',
        small ? 'text-[10px] px-1 py-0' : 'text-xs px-1.5 py-0.5',
        colors,
        className
      )}
    >
      {method.toUpperCase()}
    </span>
  )
}
