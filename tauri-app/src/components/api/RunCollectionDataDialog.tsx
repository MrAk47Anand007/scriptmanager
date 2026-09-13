import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { parseDataText } from '@/lib/dataRows'
import type { DataRow } from '@/lib/apiRuntimeClient'
import { cn } from '@/lib/utils'

/**
 * Paste CSV/JSON data rows and fan the collection over them: each row's keys
 * become variables for one full pass over the collection.
 */
export function RunCollectionDataDialog({ open, onOpenChange, collectionName, onRun }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionName: string
  onRun: (rows: DataRow[]) => void
}) {
  const [kind, setKind] = useState<'csv' | 'json'>('csv')
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseDataText(kind, text), [kind, text])

  const sample = kind === 'csv'
    ? 'username,password\nana,s3cret\nbruno,hunter2'
    : '[\n  { "username": "ana", "password": "s3cret" },\n  { "username": "bruno", "password": "hunter2" }\n]'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run “{collectionName}” with data</DialogTitle>
          <DialogDescription>
            Each row runs the whole collection once; row keys become variables (lowest precedence).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5 text-xs w-fit">
            {(['csv', 'json'] as const).map((option) => (
              <button
                key={option}
                onClick={() => setKind(option)}
                className={cn(
                  'rounded px-3 py-1 font-medium uppercase',
                  kind === option ? 'bg-background shadow-xs' : 'text-muted-foreground'
                )}
              >
                {option}
              </button>
            ))}
            <button
              onClick={() => setText(sample)}
              className="ml-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Insert sample
            </button>
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder={sample}
            className="h-44 w-full resize-none rounded-md border border-wb-border bg-background p-2.5 font-mono text-[11px] outline-none focus:border-accent-brand"
          />
          <p className={cn('text-[11px]', parsed.error ? 'text-destructive' : 'text-muted-foreground')}>
            {parsed.error
              ? parsed.error
              : `${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'} · keys: ${Object.keys(parsed.rows[0] ?? {}).join(', ') || '—'}`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="gap-1.5"
            disabled={parsed.rows.length === 0}
            onClick={() => onRun(parsed.rows)}
          >
            <Play className="h-3.5 w-3.5" />
            Run {parsed.rows.length > 0 ? `${parsed.rows.length}×` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
