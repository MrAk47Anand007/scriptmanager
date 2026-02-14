'use client'

import React, { useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchVersions, fetchVersionContent } from '@/features/scripts/scriptsSlice'
import type { ScriptVersionMeta } from '@/features/scripts/scriptsSlice'
import { Button } from '@/components/ui/button'
import { Loader2, History, ChevronDown, ChevronRight, RotateCcw, Eye } from 'lucide-react'
import { DiffEditor } from '@monaco-editor/react'

interface VersionHistoryPanelProps {
    scriptId: string
    currentContent: string
    language: string
    onRestore: (content: string) => void
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    if (diffSecs < 60) return 'just now'
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
}

const MONACO_LANGUAGE_MAP: Record<string, string> = {
    python: 'python',
    node: 'javascript',
    shell: 'shell',
    custom: 'plaintext',
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
    scriptId,
    currentContent,
    language,
    onRestore,
}) => {
    const dispatch = useAppDispatch()
    const { versions, versionsStatus } = useAppSelector(s => s.scripts)

    const [isOpen, setIsOpen] = useState(false)
    const [selectedVersion, setSelectedVersion] = useState<ScriptVersionMeta | null>(null)
    const [selectedContent, setSelectedContent] = useState<string | null>(null)
    const [loadingVersionId, setLoadingVersionId] = useState<string | null>(null)
    const [showDiff, setShowDiff] = useState(false)

    const handleToggle = useCallback(() => {
        const next = !isOpen
        setIsOpen(next)
        if (next && versionsStatus === 'idle') {
            dispatch(fetchVersions(scriptId))
        }
    }, [isOpen, versionsStatus, dispatch, scriptId])

    const handleSelectVersion = useCallback(async (version: ScriptVersionMeta) => {
        if (selectedVersion?.id === version.id) {
            // Toggle diff view off
            setSelectedVersion(null)
            setSelectedContent(null)
            setShowDiff(false)
            return
        }
        setLoadingVersionId(version.id)
        try {
            const result = await dispatch(fetchVersionContent({ scriptId, versionId: version.id })).unwrap()
            setSelectedVersion(version)
            setSelectedContent(result.content)
            setShowDiff(true)
        } finally {
            setLoadingVersionId(null)
        }
    }, [selectedVersion, dispatch, scriptId])

    const handleRestore = useCallback(() => {
        if (selectedContent !== null) {
            onRestore(selectedContent)
            setShowDiff(false)
            setSelectedVersion(null)
            setSelectedContent(null)
        }
    }, [selectedContent, onRestore])

    const monacoLang = MONACO_LANGUAGE_MAP[language] ?? 'plaintext'

    return (
        <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <button
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                onClick={handleToggle}
            >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <History className="h-4 w-4 text-slate-500" />
                    Version History
                    {versions.length > 0 && (
                        <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
                            {versions.length}
                        </span>
                    )}
                </span>
                {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
            </button>

            {isOpen && (
                <div className="border-t">
                    {versionsStatus === 'loading' && (
                        <div className="flex justify-center items-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                        </div>
                    )}

                    {versionsStatus === 'succeeded' && versions.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4 px-4">
                            No saved versions yet. Save the script to create a snapshot.
                        </p>
                    )}

                    {versionsStatus === 'succeeded' && versions.length > 0 && (
                        <ul className="divide-y">
                            {versions.map(v => (
                                <li key={v.id}>
                                    <button
                                        className={`w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left ${selectedVersion?.id === v.id ? 'bg-blue-50' : ''}`}
                                        onClick={() => handleSelectVersion(v)}
                                    >
                                        <div>
                                            <span className="text-xs font-medium text-slate-700">
                                                Snapshot #{v.snapshot_number}
                                            </span>
                                            <span className="ml-2 text-xs text-slate-400">
                                                {formatRelativeTime(v.saved_at)}
                                            </span>
                                        </div>
                                        {loadingVersionId === v.id ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                        ) : (
                                            <Eye className={`h-3.5 w-3.5 ${selectedVersion?.id === v.id ? 'text-blue-500' : 'text-slate-300'}`} />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Diff view */}
                    {showDiff && selectedContent !== null && selectedVersion && (
                        <div className="border-t">
                            <div className="flex items-center justify-between px-4 py-2 bg-slate-50">
                                <span className="text-xs text-slate-500">
                                    Snapshot #{selectedVersion.snapshot_number} vs Current
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1"
                                        onClick={handleRestore}
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Restore This Version
                                    </Button>
                                </div>
                            </div>
                            <div className="h-64">
                                <DiffEditor
                                    original={selectedContent}
                                    modified={currentContent}
                                    language={monacoLang}
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: false },
                                        fontSize: 12,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        renderSideBySide: true,
                                        wordWrap: 'on',
                                    }}
                                    theme="vs"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
