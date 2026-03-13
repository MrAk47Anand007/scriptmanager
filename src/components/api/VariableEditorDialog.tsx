'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { KeyValueTable } from './KeyValueTable'
import type { KeyValueRow } from '@/features/api/apiSlice'

interface VariableEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  name?: string
  onNameChange?: (value: string) => void
  rows: KeyValueRow[]
  onRowsChange: (rows: KeyValueRow[]) => void
  onSave: () => void | Promise<void>
}

export function VariableEditorDialog({
  open,
  onOpenChange,
  title,
  description,
  name,
  onNameChange,
  rows,
  onRowsChange,
  onSave,
}: VariableEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {onNameChange && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Name</label>
              <Input
                value={name ?? ''}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Environment name"
                className="h-9 text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 block">Variables</label>
            <div className="max-h-[360px] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800 p-3">
              <KeyValueTable
                rows={rows}
                onChange={onRowsChange}
                keyPlaceholder="Variable name"
                valuePlaceholder="Value"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
