'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveScript } from '@/features/scripts/scriptsSlice'
import type { Script } from '@/features/scripts/scriptsSlice'
import { FileCode, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

function highlight(text: string, query: string) {
    if (!query.trim()) return <span>{text}</span>
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return <span>{text}</span>
    return (
        <span>
            {text.slice(0, idx)}
            <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0">{text.slice(idx, idx + query.length)}</mark>
            {text.slice(idx + query.length)}
        </span>
    )
}

interface QuickSwitcherProps {
    open: boolean
    onClose: () => void
}

export const QuickSwitcher = ({ open, onClose }: QuickSwitcherProps) => {
    const dispatch = useAppDispatch()
    const { items: scripts, collections } = useAppSelector((state) => state.scripts)
    const [query, setQuery] = useState('')
    const [cursor, setCursor] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    const collectionMap = Object.fromEntries(collections.map(c => [c.id, c.name]))

    const filtered: Script[] = query.trim()
        ? scripts.filter(s =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            (s.description ?? '').toLowerCase().includes(query.toLowerCase())
        )
        : scripts.slice(0, 12)

    // Reset cursor when results change
    useEffect(() => {
        setCursor(0)
    }, [query])

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery('')
            setCursor(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open])

    const select = useCallback((script: Script) => {
        dispatch(setActiveScript(script.id))
        onClose()
    }, [dispatch, onClose])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor(c => Math.min(c + 1, filtered.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor(c => Math.max(c - 1, 0))
        } else if (e.key === 'Enter') {
            if (filtered[cursor]) select(filtered[cursor])
        } else if (e.key === 'Escape') {
            onClose()
        }
    }

    // Scroll active item into view
    useEffect(() => {
        const item = listRef.current?.children[cursor] as HTMLElement | undefined
        item?.scrollIntoView({ block: 'nearest' })
    }, [cursor])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                {/* Search input */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                    <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search scripts…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    <kbd className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Esc</kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="overflow-y-auto max-h-80">
                    {filtered.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-slate-400">No scripts found</div>
                    )}
                    {filtered.map((script, i) => (
                        <div
                            key={script.id}
                            className={cn(
                                "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                i === cursor ? "bg-blue-50" : "hover:bg-slate-50"
                            )}
                            onMouseEnter={() => setCursor(i)}
                            onMouseDown={() => select(script)}
                        >
                            <FileCode className={cn("h-4 w-4 flex-shrink-0", i === cursor ? "text-blue-500" : "text-slate-400")} />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-800 truncate">
                                    {highlight(script.name, query)}
                                </div>
                                {script.description && (
                                    <div className="text-xs text-slate-400 truncate">
                                        {highlight(script.description, query)}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {script.language && (
                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                        {script.language}
                                    </span>
                                )}
                                {script.collection_id && collectionMap[script.collection_id] && (
                                    <span className="text-[10px] text-slate-400">
                                        {collectionMap[script.collection_id]}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
                    <span><kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200">↑↓</kbd> navigate</span>
                    <span><kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200">↵</kbd> open</span>
                    <span><kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200">Esc</kbd> close</span>
                </div>
            </div>
        </div>
    )
}
