'use client'

import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { EnvVar } from '@/features/scripts/scriptsSlice'

interface Props {
    envVars: EnvVar[]
    onAdd: (key: string, value: string, isSecret: boolean) => void
    onDelete: (key: string) => void
    disabled?: boolean
}

export function EnvVarsPanel({ envVars, onAdd, onDelete, disabled }: Props) {
    const [isExpanded, setIsExpanded] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newKey, setNewKey] = useState('')
    const [newValue, setNewValue] = useState('')
    const [newIsSecret, setNewIsSecret] = useState(false)
    const [addError, setAddError] = useState('')
    const [revealed, setRevealed] = useState<Record<string, boolean>>({})

    const existingKeys = new Set(envVars.map(v => v.key.toUpperCase()))

    const handleAdd = () => {
        const key = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
        if (!key) { setAddError('Key is required'); return }
        if (existingKeys.has(key)) { setAddError('Key already exists'); return }
        onAdd(key, newValue, newIsSecret)
        setNewKey('')
        setNewValue('')
        setNewIsSecret(false)
        setAddError('')
        setIsAdding(false)
    }

    const toggleReveal = (key: string) => {
        setRevealed(prev => ({ ...prev, [key]: !prev[key] }))
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Env Variables
                </h3>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => { setIsAdding(true); setIsExpanded(true) }}
                        title="Add env var"
                        disabled={disabled}
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
                <div className="space-y-1.5">
                    {envVars.length === 0 && !isAdding && (
                        <p className="text-[10px] text-slate-400 italic">
                            No env vars. Click <span className="font-semibold">+</span> to add one.
                        </p>
                    )}

                    {envVars.map(v => (
                        <div
                            key={v.key}
                            className="border border-slate-200 rounded px-2 py-1.5 bg-slate-50 flex items-center gap-1"
                        >
                            <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-mono font-semibold text-slate-700 truncate">{v.key}</span>
                                    {v.is_secret && (
                                        <span className="text-[9px] bg-amber-100 text-amber-700 rounded px-1 font-medium">secret</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    {v.is_secret ? (
                                        <span className="text-[10px] font-mono text-slate-400 flex-1 truncate">
                                            {revealed[v.key] ? '(secret — stored securely)' : '••••••••'}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-mono text-slate-500 flex-1 truncate">{v.value || <em className="text-slate-300">empty</em>}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                                {v.is_secret && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={() => toggleReveal(v.key)}
                                        title={revealed[v.key] ? 'Hide' : 'Reveal'}
                                    >
                                        {revealed[v.key]
                                            ? <EyeOff className="h-2.5 w-2.5 text-slate-400" />
                                            : <Eye className="h-2.5 w-2.5 text-slate-400" />
                                        }
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => onDelete(v.key)}
                                    title="Delete"
                                    disabled={disabled}
                                >
                                    <Trash2 className="h-2.5 w-2.5 text-red-400" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {isAdding && (
                        <div className="border border-blue-200 rounded p-2 bg-blue-50/40 space-y-1.5">
                            <Input
                                autoFocus
                                className="h-6 text-xs font-mono"
                                placeholder="KEY_NAME"
                                value={newKey}
                                onChange={(e) => {
                                    setNewKey(e.target.value.toUpperCase().replace(/\s/g, '_'))
                                    if (addError) setAddError('')
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            />
                            <Input
                                className="h-6 text-xs font-mono"
                                placeholder="value"
                                type={newIsSecret ? 'password' : 'text'}
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                            />
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="env-secret"
                                    checked={newIsSecret}
                                    onCheckedChange={(v) => setNewIsSecret(!!v)}
                                    className="h-3 w-3"
                                />
                                <Label htmlFor="env-secret" className="text-[10px] text-slate-500 cursor-pointer">Secret (value masked in UI)</Label>
                            </div>
                            {addError && <p className="text-[10px] text-red-500">{addError}</p>}
                            <div className="flex gap-1">
                                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleAdd}>Add</Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => { setIsAdding(false); setAddError('') }}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    {envVars.length > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1">
                            Injected into process environment at runtime
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
