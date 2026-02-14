'use client'

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

interface Props {
    open: boolean
    parameters: ScriptParameter[]
    onRun: (values: Record<string, string>) => void
    onCancel: () => void
}

export function RunInputsDialog({ open, parameters, onRun, onCancel }: Props) {
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
                                    className="h-7 text-xs font-mono"
                                    type={p.type === 'number' ? 'number' : 'text'}
                                    value={values[p.name] ?? ''}
                                    onChange={(e) => setValue(p.name, e.target.value)}
                                    placeholder={p.defaultValue ?? `Enter ${p.name}`}
                                />
                            )}
                            {errors[p.name] && (
                                <p className="text-[10px] text-red-500">{errors[p.name]}</p>
                            )}
                        </div>
                    ))}
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
                    <Button
                        size="sm"
                        className="text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={handleRun}
                    >
                        Run
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
