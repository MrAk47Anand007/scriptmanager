
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ApiMaterializedRequest } from '@/lib/apiRequestMaterialization'

interface VariableInspectorProps {
  preview: ApiMaterializedRequest | null
  onAddToRequest: (name: string) => void
  onAddToEnvironment: (name: string) => void
  onAddToGlobals: (name: string) => void
  hasActiveEnvironment: boolean
}

export function VariableInspector({
  preview,
  onAddToRequest,
  onAddToEnvironment,
  onAddToGlobals,
  hasActiveEnvironment,
}: VariableInspectorProps) {
  if (!preview || preview.variables.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">No variables detected in this request</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          Use <code className="font-mono">{'{{variable_name}}'}</code> in URL, params, headers, auth, or body to make this request reusable.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Variables in Request</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
          Review the final value and where it comes from before sending.
        </p>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {preview.variables.map((variable) => (
          <div key={variable.name} className="px-3 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-semibold text-slate-700 dark:text-slate-200">{`{{${variable.name}}}`}</code>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    variable.resolved
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  )}
                >
                  {variable.resolved ? `resolved from ${variable.sourceScope}` : 'missing'}
                </span>
                <span className="text-[10px] text-slate-400">{variable.occurrences} use{variable.occurrences === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[11px] font-mono mt-2 break-all text-slate-500 dark:text-slate-400">
                {variable.resolved ? variable.resolvedValue : 'No value available yet'}
              </p>
            </div>

            {!variable.resolved && (
              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onAddToRequest(variable.name)}>
                  Add to Request
                </Button>
                {hasActiveEnvironment && (
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onAddToEnvironment(variable.name)}>
                    Add to Env
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onAddToGlobals(variable.name)}>
                  Add to Globals
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
