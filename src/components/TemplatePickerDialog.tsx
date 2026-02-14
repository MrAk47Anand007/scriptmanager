'use client'

import { useState, useEffect } from 'react'
import type { ScriptTemplate } from '@/features/scripts/scriptsSlice'
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
import { cn } from '@/lib/utils'
import { Search, LayoutTemplate, ChevronLeft } from 'lucide-react'

interface Props {
    open: boolean
    templates: ScriptTemplate[]
    onClose: () => void
    onSelect: (template: ScriptTemplate, name: string) => void
}

const CATEGORY_ALL = 'all'

const LANGUAGE_BADGE_COLORS: Record<string, string> = {
    python: 'bg-blue-100 text-blue-700',
    node: 'bg-green-100 text-green-700',
    shell: 'bg-orange-100 text-orange-700',
}

function languageBadgeClass(lang: string) {
    return LANGUAGE_BADGE_COLORS[lang.toLowerCase()] ?? 'bg-slate-100 text-slate-600'
}

export function TemplatePickerDialog({ open, templates, onClose, onSelect }: Props) {
    const [step, setStep] = useState<'pick' | 'name'>('pick')
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState(CATEGORY_ALL)
    const [selected, setSelected] = useState<ScriptTemplate | null>(null)
    const [scriptName, setScriptName] = useState('')
    const [nameError, setNameError] = useState('')

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setStep('pick')
            setSearch('')
            setCategory(CATEGORY_ALL)
            setSelected(null)
            setScriptName('')
            setNameError('')
        }
    }, [open])

    const categories = [CATEGORY_ALL, ...Array.from(new Set(templates.map(t => t.category))).sort()]

    const filtered = templates.filter(t => {
        const matchesCategory = category === CATEGORY_ALL || t.category === category
        const q = search.toLowerCase()
        const matchesSearch =
            !q ||
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        return matchesCategory && matchesSearch
    })

    const handleSelectTemplate = (tpl: ScriptTemplate) => {
        setSelected(tpl)
        setScriptName(tpl.name)
        setNameError('')
        setStep('name')
    }

    const handleCreate = () => {
        if (!scriptName.trim()) {
            setNameError('Script name is required')
            return
        }
        if (selected) {
            onSelect(selected, scriptName.trim())
        }
    }

    const handleBack = () => {
        setStep('pick')
        setNameError('')
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <LayoutTemplate className="h-4 w-4 text-blue-500" />
                        {step === 'pick' ? 'New Script from Template' : 'Name Your Script'}
                    </DialogTitle>
                </DialogHeader>

                {step === 'pick' && (
                    <>
                        {/* Search + category filter */}
                        <div className="space-y-2 py-1">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                <Input
                                    autoFocus
                                    placeholder="Search templates…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-7 h-8 text-xs"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={cn(
                                            'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border',
                                            category === cat
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        )}
                                    >
                                        {cat === CATEGORY_ALL ? 'All' : cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Template grid */}
                        <div className="flex-1 overflow-y-auto min-h-0">
                            {filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <LayoutTemplate className="h-8 w-8 mb-2 opacity-40" />
                                    <p className="text-xs">No templates found</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 pb-2">
                                    {filtered.map(tpl => (
                                        <button
                                            key={tpl.id}
                                            onClick={() => handleSelectTemplate(tpl)}
                                            className="text-left border rounded-lg p-3 bg-white hover:border-blue-300 hover:bg-blue-50/40 transition-colors group space-y-1.5"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-blue-700 transition-colors">
                                                    {tpl.name}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {tpl.is_built_in && (
                                                        <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-medium">
                                                            Built-in
                                                        </span>
                                                    )}
                                                    <span className={cn(
                                                        'text-[9px] rounded px-1 py-0.5 font-medium',
                                                        languageBadgeClass(tpl.language)
                                                    )}>
                                                        {tpl.language}
                                                    </span>
                                                </div>
                                            </div>
                                            {tpl.description && (
                                                <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">
                                                    {tpl.description}
                                                </p>
                                            )}
                                            <span className="text-[9px] text-slate-400 capitalize">{tpl.category}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
                                Cancel
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {step === 'name' && selected && (
                    <>
                        <div className="space-y-4 py-2">
                            {/* Template info */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-md border border-slate-200">
                                <LayoutTemplate className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500">From template</p>
                                    <p className="text-xs font-medium text-slate-700 truncate">{selected.name}</p>
                                </div>
                                <span className={cn(
                                    'ml-auto text-[9px] rounded px-1.5 py-0.5 font-medium shrink-0',
                                    languageBadgeClass(selected.language)
                                )}>
                                    {selected.language}
                                </span>
                            </div>

                            {/* Script name input */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Script Name</Label>
                                <Input
                                    autoFocus
                                    className="h-8 text-xs"
                                    placeholder="my-script"
                                    value={scriptName}
                                    onChange={(e) => {
                                        setScriptName(e.target.value)
                                        if (nameError) setNameError('')
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                />
                                {nameError && (
                                    <p className="text-[10px] text-red-500">{nameError}</p>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={handleBack}
                            >
                                <ChevronLeft className="h-3 w-3 mr-1" />
                                Back
                            </Button>
                            <Button
                                size="sm"
                                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={handleCreate}
                                disabled={!scriptName.trim()}
                            >
                                Create Script
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
