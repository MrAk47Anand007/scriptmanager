
import { Download } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { exportCollectionRunHtmlRuntime, exportCollectionRunJunitRuntime } from '@/lib/apiRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import type { ApiCollectionRun } from '@/features/api/apiSlice'
import { cn } from '@/lib/utils'

interface CollectionRunDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  run: ApiCollectionRun | null
}

export function CollectionRunDialog({ open, onOpenChange, run }: CollectionRunDialogProps) {
  const results = run ? (() => {
    try { return JSON.parse(run.results) as Array<Record<string, unknown>> } catch { return [] }
  })() : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>{run ? `${run.collection_name} Run` : 'Collection Run'}</DialogTitle>
            {run && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => {
                    void exportCollectionRunJunitRuntime(run.id, run.collection_name)
                      .then(() => toast.success('JUnit XML downloaded'))
                      .catch((error) => toast.error(getOperationError(error, 'Export failed')))
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> JUnit XML
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 h-8 text-xs"
                  onClick={() => {
                    void exportCollectionRunHtmlRuntime(run.id, run.collection_name)
                      .then(() => toast.success('HTML report downloaded'))
                      .catch((error) => toast.error(getOperationError(error, 'Export failed')))
                  }}
                >
                  <Download className="h-3.5 w-3.5" /> HTML report
                </Button>
              </div>
            )}
          </div>
          <DialogDescription>
            {run ? `${run.passed_requests}/${run.total_requests} requests passed${run.environment_name ? ` using ${run.environment_name}` : ''}.` : 'Run details'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <th className="py-2 px-3 text-left font-medium text-slate-500">Request</th>
                <th className="py-2 px-3 text-left font-medium text-slate-500">Status</th>
                <th className="py-2 px-3 text-left font-medium text-slate-500">Duration</th>
                <th className="py-2 px-3 text-left font-medium text-slate-500">Tests</th>
                <th className="py-2 px-3 text-left font-medium text-slate-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={`${result.request_id as string}-${index}`} className="border-b border-slate-100 dark:border-slate-800 align-top">
                  <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-200">
                    {result.rowIndex !== undefined && result.rowIndex !== null && (
                      <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        row {(result.rowIndex as number) + 1}
                      </span>
                    )}
                    {String(result.request_name ?? 'Unknown')}
                    {result.row && typeof result.row === 'object' && (
                      <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                        {Object.entries(result.row as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`).join(' ')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span className={cn(
                      'font-semibold',
                      result.passed ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'
                    )}>
                      {String(result.status ?? '')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-500">{String(result.duration ?? 0)}ms</td>
                  <td className="py-2 px-3 text-slate-500">{String(result.failed_tests ?? 0)} failed</td>
                  <td className="py-2 px-3 text-slate-500 whitespace-pre-wrap break-words">
                    {String(result.error ?? '') || 'OK'}
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 px-3 text-center text-slate-400">No run results available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
