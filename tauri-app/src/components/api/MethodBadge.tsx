

import { cn } from '@/lib/utils'

const METHOD_COLORS: Record<string, string> = {
  GET:     'text-green-600  bg-green-50   dark:text-green-400  dark:bg-green-950/40',
  POST:    'text-blue-600   bg-blue-50    dark:text-blue-400   dark:bg-blue-950/40',
  PUT:     'text-yellow-600 bg-yellow-50  dark:text-yellow-400 dark:bg-yellow-950/40',
  PATCH:   'text-orange-600 bg-orange-50  dark:text-orange-400 dark:bg-orange-950/40',
  DELETE:  'text-red-600    bg-red-50     dark:text-red-400    dark:bg-red-950/40',
  HEAD:    'text-purple-600 bg-purple-50  dark:text-purple-400 dark:bg-purple-950/40',
  OPTIONS: 'text-slate-600  bg-slate-100  dark:text-slate-400  dark:bg-slate-800',
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
        'inline-flex items-center font-mono font-bold rounded uppercase',
        small ? 'text-[10px] px-1.5 py-0.5' : 'text-[10px] px-1.5 py-0.5',
        colors,
        className
      )}
    >
      {method.toUpperCase()}
    </span>
  )
}
