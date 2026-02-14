'use client'

import { useState, useRef, useEffect } from 'react'
import type { Tag } from '@/features/scripts/scriptsSlice'
import { X, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    scriptId: string
    tags: Tag[]
    allTags: Tag[]
    onAdd: (name: string) => void
    onRemove: (tagId: string) => void
    disabled?: boolean
}

// Deterministic color from tag name
const TAG_COLORS = [
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#f43f5e', // rose
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
]

export function tagColor(name: string): string {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
    return (
        <span
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}
        >
            {tag.name}
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove() }}
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    title="Remove tag"
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            )}
        </span>
    )
}

export function TagsInput({ scriptId: _scriptId, tags, allTags, onAdd, onRemove, disabled }: Props) {
    const [input, setInput] = useState('')
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [activeIdx, setActiveIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const existingNames = new Set(tags.map(t => t.name.toLowerCase()))

    const suggestions = allTags.filter(t =>
        !existingNames.has(t.name.toLowerCase()) &&
        (input.trim() === '' || t.name.toLowerCase().includes(input.toLowerCase()))
    ).slice(0, 8)

    const canCreate = input.trim().length > 0 && !existingNames.has(input.trim().toLowerCase())

    useEffect(() => {
        setActiveIdx(0)
    }, [input])

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowSuggestions(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const submit = (name: string) => {
        const clean = name.trim().toLowerCase()
        if (!clean || existingNames.has(clean)) return
        onAdd(clean)
        setInput('')
        setShowSuggestions(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const totalItems = suggestions.length + (canCreate ? 1 : 0)
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIdx(i => (i + 1) % Math.max(totalItems, 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIdx(i => (i - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (totalItems > 0) {
                if (activeIdx < suggestions.length) {
                    submit(suggestions[activeIdx].name)
                } else if (canCreate) {
                    submit(input)
                }
            } else if (canCreate) {
                submit(input)
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false)
        } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
            onRemove(tags[tags.length - 1].id)
        }
    }

    return (
        <div>
            <div className="flex items-center gap-1 mb-2">
                <TagIcon className="h-3 w-3 text-slate-400" />
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Tags</h3>
            </div>
            <div
                ref={containerRef}
                className="relative"
            >
                <div
                    className={cn(
                        "flex flex-wrap gap-1 min-h-[28px] px-1.5 py-1 rounded border bg-white text-xs cursor-text",
                        disabled ? "opacity-50 pointer-events-none" : "border-slate-200 focus-within:border-blue-400"
                    )}
                    onClick={() => inputRef.current?.focus()}
                >
                    {tags.map(tag => (
                        <TagChip
                            key={tag.id}
                            tag={tag}
                            onRemove={() => onRemove(tag.id)}
                        />
                    ))}
                    <input
                        ref={inputRef}
                        className="flex-1 min-w-[60px] outline-none bg-transparent text-[10px] placeholder:text-slate-400"
                        placeholder={tags.length === 0 ? 'Add tags…' : ''}
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value)
                            setShowSuggestions(true)
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                    />
                </div>

                {showSuggestions && (suggestions.length > 0 || canCreate) && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded shadow-lg text-xs overflow-hidden">
                        {suggestions.map((tag, i) => (
                            <button
                                key={tag.id}
                                className={cn(
                                    "w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors",
                                    i === activeIdx && "bg-slate-50"
                                )}
                                onMouseDown={(e) => { e.preventDefault(); submit(tag.name) }}
                            >
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                />
                                <span className="text-[10px]">{tag.name}</span>
                            </button>
                        ))}
                        {canCreate && (
                            <button
                                className={cn(
                                    "w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors text-blue-600",
                                    activeIdx === suggestions.length && "bg-slate-50"
                                )}
                                onMouseDown={(e) => { e.preventDefault(); submit(input) }}
                            >
                                <span className="text-[10px]">Create tag &quot;{input.trim().toLowerCase()}&quot;</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
            {tags.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">Press Backspace to remove last tag</p>
            )}
        </div>
    )
}
