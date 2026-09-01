

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { KeyValueRow } from '@/features/api/apiSlice'

interface KeyValueTableProps {
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
  disabled?: boolean
}

export function KeyValueTable({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  disabled = false
}: KeyValueTableProps) {
  const updateRow = (id: string, field: keyof KeyValueRow, value: string | boolean) => {
    onChange(rows.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const addRow = () => {
    onChange([...rows, { id: uuidv4(), key: '', value: '', enabled: true }])
  }

  const removeRow = (id: string) => {
    const filtered = rows.filter(r => r.id !== id)
    if (filtered.length === 0) {
      onChange([{ id: uuidv4(), key: '', value: '', enabled: true }])
    } else {
      onChange(filtered)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-1.5">
          <Checkbox
            checked={row.enabled}
            onCheckedChange={(checked) => updateRow(row.id, 'enabled', Boolean(checked))}
            disabled={disabled}
            className="shrink-0 h-3.5 w-3.5"
          />
          <Input
            value={row.key}
            onChange={(e) => updateRow(row.id, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            disabled={disabled || !row.enabled}
            className="h-7 text-xs font-mono flex-1 min-w-0"
          />
          <Input
            value={row.value}
            onChange={(e) => updateRow(row.id, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            disabled={disabled || !row.enabled}
            className="h-7 text-xs flex-1 min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRow(row.id)}
            disabled={disabled}
            className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className="self-start h-6 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 mt-0.5"
      >
        <Plus className="h-3 w-3 mr-1" />
        Add Row
      </Button>
    </div>
  )
}
