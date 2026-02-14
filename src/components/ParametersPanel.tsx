'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import type { ScriptParameter } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface Props {
    parameters: ScriptParameter[]
    onChange: (params: ScriptParameter[]) => void
}

export function ParametersPanel({ parameters, onChange }: Props) {
    const [isExpanded, setIsExpanded] = useState(true)

    const addParam = () => {
        const newParam: ScriptParameter = {
            name: '',
            type: 'string',
            required: false,
            defaultValue: '',
            description: '',
        }
        onChange([...parameters, newParam])
    }

    const removeParam = (index: number) => {
        onChange(parameters.filter((_, i) => i !== index))
    }

    const updateParam = (index: number, partial: Partial<ScriptParameter>) => {
        onChange(parameters.map((p, i) => (i === index ? { ...p, ...partial } : p)))
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <SlidersHorizontal className="h-3 w-3" /> Parameters
                </h3>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={addParam}
                        title="Add parameter"
                    >
                        <Plus className="h-3 w-3 text-slate-400" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded
                            ? <ChevronUp className="h-3 w-3 text-slate-400" />
                            : <ChevronDown className="h-3 w-3 text-slate-400" />
                        }
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="space-y-2">
                    {parameters.length === 0 && (
                        <p className="text-[10px] text-slate-400 italic">
                            No parameters. Click <span className="font-semibold">+</span> to add one.
                        </p>
                    )}

                    {parameters.map((param, i) => (
                        <div
                            key={i}
                            className="border border-slate-200 rounded p-2 bg-slate-50 space-y-1.5"
                        >
                            {/* Name + type + delete row */}
                            <div className="flex items-center gap-1">
                                <Input
                                    className="h-6 text-xs font-mono flex-1"
                                    placeholder="PARAM_NAME"
                                    value={param.name}
                                    onChange={(e) =>
                                        updateParam(i, {
                                            name: e.target.value
                                                .toUpperCase()
                                                .replace(/\s/g, '_'),
                                        })
                                    }
                                />
                                <Select
                                    value={param.type}
                                    onValueChange={(v) =>
                                        updateParam(i, { type: v as ScriptParameter['type'] })
                                    }
                                >
                                    <SelectTrigger className="h-6 w-[76px] text-[10px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="string">string</SelectItem>
                                        <SelectItem value="number">number</SelectItem>
                                        <SelectItem value="boolean">bool</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0"
                                    onClick={() => removeParam(i)}
                                    title="Remove parameter"
                                >
                                    <Trash2 className="h-3 w-3 text-red-400" />
                                </Button>
                            </div>

                            {/* Default value */}
                            <Input
                                className="h-6 text-[10px]"
                                placeholder="Default value (optional)"
                                value={param.defaultValue ?? ''}
                                onChange={(e) =>
                                    updateParam(i, { defaultValue: e.target.value })
                                }
                            />

                            {/* Description */}
                            <Input
                                className="h-6 text-[10px]"
                                placeholder="Description (optional)"
                                value={param.description ?? ''}
                                onChange={(e) =>
                                    updateParam(i, { description: e.target.value })
                                }
                            />

                            {/* Required checkbox */}
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id={`req-${i}`}
                                    checked={param.required}
                                    onCheckedChange={(v) =>
                                        updateParam(i, { required: !!v })
                                    }
                                    className="h-3 w-3"
                                />
                                <Label
                                    htmlFor={`req-${i}`}
                                    className="text-[10px] text-slate-500 cursor-pointer"
                                >
                                    Required
                                </Label>
                            </div>
                        </div>
                    ))}

                    {parameters.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1">
                            Injected as env vars by exact name (e.g.{' '}
                            <code className="bg-slate-100 px-0.5 rounded">API_KEY</code>)
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
