

import { useState } from 'react'
import type { ScriptParameter } from '@/lib/types'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    parameters: ScriptParameter[]
    onRun: (values: Record<string, string>) => void
    onCancel: () => void
    onRunData?: (rows: Record<string, string>[]) => void
}

export function RunInputsDialog({ open, parameters, onRun, onCancel, onRunData }: Props) {
    const [dataMode, setDataMode] = useState(false)
    const [dataText, setDataText] = useState('')
    const [values, setValues] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {}
        for (const p of parameters) {
            init[p.name] = p.defaultValue ?? (p.type === 'boolean' ? 'false' : '')
        }
        return init
    })

    const [errors, setErrors] = useState<Record<string, string>>({})

    const setValue = (name: string, val: string) => {
        setValues((prev) => ({ ...prev, [name]: val }))
        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: '' }))
        }
    }

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {}
        for (const p of parameters) {
            const val = values[p.name] ?? ''
            if (p.required && val.trim() === '') {
                newErrors[p.name] = 'Required'
            } else if (
                p.type === 'number' &&
                val.trim() !== '' &&
                isNaN(Number(val))
            ) {
                newErrors[p.name] = 'Must be a number'
            }
        }
        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const parsedRows = (() => {
        if (!dataText.trim()) return { rows: [] as Record<string, string>[], error: '' }
        try {
            const trimmed = dataText.trim()
            if (trimmed.startsWith('[')) {
                const parsed = JSON.parse(trimmed) as unknown
                if (!Array.isArray(parsed)) return { rows: [], error: 'JSON must be an array of objects' }
                return { rows: parsed as Record<string, string>[], error: '' }
            }
            const lines = trimmed.split(/\r?\n/).filter((line) => line.trim())
            if (lines.length < 2) return { rows: [], error: 'CSV needs a header row and at least one data row' }
            const headers = lines[0].split(',').map((h) => h.trim())
            const rows = lines.slice(1).map((line) => {
                const cells = line.split(',').map((c) => c.trim())
                const row: Record<string, string> = {}
                headers.forEach((header, i) => { row[header] = cells[i] ?? '' })
                return row
            })
            return { rows, error: '' }
        } catch (error) {
            return { rows: [], error: error instanceof Error ? error.message : 'Invalid data' }
        }
    })()

    const handleRun = () => {
        if (!validate()) return
        onRun(values)
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-sm">Run — Fill Parameters</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1 max-h-[60vh] overflow-y-auto pr-1">
                    {parameters.map((p) => (
                        <div key={p.name} className="space-y-1">
                            <Label className="text-xs font-mono font-semibold flex items-center gap-1">
                                {p.name}
                                {p.required && (
                                    <span className="text-red-500">*</span>
                                )}
                                <span className="ml-1 text-[10px] font-normal text-slate-400 font-sans">
                                    ({p.type})
                                </span>
                            </Label>
                            {p.description && (
                                <p className="text-[10px] text-slate-400">{p.description}</p>
                            )}
                            {p.type === 'boolean' ? (
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={values[p.name] === 'true'}
                                        onCheckedChange={(v) =>
                                            setValue(p.name, v ? 'true' : 'false')
                                        }
                                    />
                                    <span className="text-xs text-slate-500 font-mono">
                                        {values[p.name] === 'true' ? 'true' : 'false'}
                                    </span>
                                </div>
                            ) : (
                                <Input
                                    className="h-7 text-xs font-mono bg-white dark:bg-slate-950 dark:border-slate-700"
                                    type={p.type === 'number' ? 'number' : 'text'}
                                    value={values[p.name] ?? ''}
                                    onChange={(e) => setValue(p.name, e.target.value)}
                                />
                            )}
                        </div>
                    ))}

                    {onRunData && (
                        <div className="space-y-2 rounded-md border border-wb-border p-3">
                            <button
                                type="button"
                                className="flex items-center gap-2 text-xs font-medium text-foreground"
                                onClick={() => setDataMode((value) => !value)}
                            >
                                <span className={cn('inline-flex h-4 w-7 items-center rounded-full transition-colors', dataMode ? 'bg-accent-brand' : 'bg-muted')}>
                                    <span className={cn('h-3 w-3 rounded-full bg-white shadow transition-transform', dataMode ? 'translate-x-3.5' : 'translate-x-0.5')} />
                                </span>
                                Run with data (CSV)
                            </button>
                            {dataMode && (
                                <div className="space-y-1.5">
                                    <textarea
                                        value={dataText}
                                        onChange={(event) => setDataText(event.target.value)}
                                        spellCheck={false}
                                        placeholder={'username,password\nana,s3cret\nbruno,hunter2'}
                                        className="h-24 w-full resize-none rounded-md border border-wb-border bg-background p-2 font-mono text-[11px] outline-none focus:border-accent-brand"
                                    />
                                    <p className={cn('text-[10px]', parsedRows.error ? 'text-red-500' : 'text-muted-foreground')}>
                                        {parsedRows.error
                                            ? parsedRows.error
                                            : `${parsedRows.rows.length} row${parsedRows.rows.length === 1 ? '' : 's'} — one build per row, row keys become parameter values`}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    {onRunData && dataMode && parsedRows.rows.length > 0 ? (
                        <Button
                            size="sm"
                            className="text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => onRunData(parsedRows.rows)}
                        >
                            Run {parsedRows.rows.length}×
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            className="text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleRun}
                        >
                            Run
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
