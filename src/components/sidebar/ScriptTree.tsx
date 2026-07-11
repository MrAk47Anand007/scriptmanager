'use client'

import { memo, useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '@/store/hooks';
import type { Script, Collection } from '@/features/scripts/scriptsSlice';
import type { Project } from '@/features/ops/opsSlice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    FileCode, Plus, Folder, MoreVertical, Trash2, ChevronRight, ChevronDown,
    GripVertical, LayoutTemplate, Copy, Loader2, Layers, FolderOpen, Cloud, RefreshCw,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';

export const getCollectionTreeKey = (parentId: string | null, projectId: string | null) =>
    `${projectId ?? '__root_project__'}::${parentId ?? '__root_parent__'}`;

// Pixels of indentation per tree depth level
const INDENT_PX = 14;

const UnsavedIndicator = ({ scriptId }: { scriptId: string }) => {
    const isDirty = useAppSelector((state) => {
        if (state.scripts.activeScriptId !== scriptId) return false;
        const script = state.scripts.items.find(s => s.id === scriptId);
        if (!script) return false;
        // If content is undefined in items, assume empty string.
        // We compare activeScriptContent (current editor state) with script.content (saved state).
        const saved = script.content || '';
        const current = state.scripts.activeScriptContent || '';
        return saved !== current;
    });

    if (!isDirty) return null;
    return <span className="text-amber-500 ml-1 font-bold" title="Unsaved changes">*</span>;
};

const CollectionLinkStatusDot = ({
    hasLinkedFolder,
    isTemporary,
}: {
    hasLinkedFolder: boolean
    isTemporary: boolean
}) => {
    const tooltip = hasLinkedFolder
        ? (isTemporary
            ? 'Green dot: this temporary workspace is backed by a local folder.'
            : 'Green dot: this collection is linked to a real folder, so scripts and sub-collections stay mapped to folders on disk.')
        : 'Red dot: this collection is not linked to a folder yet, so it only exists inside ScriptManager metadata until you link or save it.';

    return (
        <span
            className={cn(
                "inline-flex h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset",
                hasLinkedFolder
                    ? "bg-emerald-500 ring-emerald-400/60"
                    : "bg-rose-500 ring-rose-400/60"
            )}
            title={tooltip}
            aria-label={tooltip}
        />
    );
};

export interface ScriptTreeCallbacks {
    onToggleCollection: (collectionId: string) => void;
    onToggleProject: (projectId: string) => void;
    onActivateScript: (scriptId: string) => void;
    onSaveAsTemplate: (script: Script) => void;
    onDuplicateScript: (scriptId: string) => void;
    onDeleteScript: (script: Script) => void;
    onDeleteCollection: (collection: Collection) => void;
    onCreateScript: (collectionId?: string) => void;
    onCreateCollection: (projectId?: string | null, parentId?: string | null) => void;
    onConvertCollection: (collection: Collection) => void;
    onManagePythonEnv: (collection: Collection) => void;
    onCloudStorage: (collection: Collection) => void;
    onSyncCollection: (collection: Collection) => void;
    onDeleteProject: (projectId: string) => void;
}

// --- Flattened row model -------------------------------------------------

export type TreeRow =
    | { kind: 'header'; key: string; label: string; className: string }
    | { kind: 'project'; key: string; project: Project }
    | { kind: 'collection'; key: string; collection: Collection; depth: number }
    | { kind: 'script'; key: string; script: Script; depth: number; parentCollection: Collection | null }
    | { kind: 'empty'; key: string; label: string; depth: number; className: string };

export interface FlattenTreeArgs {
    isOpsMode: boolean;
    searchActive: boolean;
    temporaryCollections: Collection[];
    savedCollections: Collection[];
    collectionsByTreeKey: Record<string, Collection[]>;
    rootSavedCollections: Collection[];
    projects: Project[];
    projectCollectionCounts: Record<string, number>;
    scriptsByCollection: Record<string, Script[]>;
    unsortedScripts: Script[];
    expandedCollections: Record<string, boolean>;
    expandedProjects: Record<string, boolean>;
}

const EMPTY_ROW_CLASS = 'px-2 py-1 text-xs text-slate-400 italic';
const NO_COLLECTIONS_ROW_CLASS = 'px-4 py-1 text-xs text-slate-400 italic';

export function flattenTree(args: FlattenTreeArgs): TreeRow[] {
    const {
        isOpsMode, searchActive,
        temporaryCollections, savedCollections, collectionsByTreeKey, rootSavedCollections,
        projects, projectCollectionCounts, scriptsByCollection, unsortedScripts,
        expandedCollections, expandedProjects,
    } = args;

    const rows: TreeRow[] = [];

    const pushScripts = (scripts: Script[], depth: number, parentCollection: Collection | null) => {
        for (const script of scripts) {
            rows.push({ kind: 'script', key: `script:${script.id}`, script, depth, parentCollection });
        }
    };

    // Collection row + (when expanded) its scripts. Used for flat (non-recursive) lists:
    // temporary workspaces and search-mode collections, which never show sub-collections.
    const pushFlatCollection = (collection: Collection, depth: number) => {
        rows.push({ kind: 'collection', key: `col:${collection.id}`, collection, depth });
        if (!expandedCollections[collection.id]) return;
        const scripts = scriptsByCollection[collection.id] ?? [];
        if (scripts.length === 0) {
            rows.push({ kind: 'empty', key: `empty:${collection.id}`, label: 'Empty', depth: depth + 1, className: EMPTY_ROW_CLASS });
        }
        pushScripts(scripts, depth + 1, collection);
    };

    // Recursive collection row: expanded content = sub-collections first, then scripts
    // (matching the original nested render order).
    const pushCollectionTree = (collection: Collection, depth: number, projectId: string | null) => {
        rows.push({ kind: 'collection', key: `col:${collection.id}`, collection, depth });
        if (!expandedCollections[collection.id]) return;
        const children = collectionsByTreeKey[getCollectionTreeKey(collection.id, projectId)] ?? [];
        for (const child of children) {
            pushCollectionTree(child, depth + 1, projectId);
        }
        const scripts = scriptsByCollection[collection.id] ?? [];
        if (scripts.length === 0) {
            rows.push({ kind: 'empty', key: `empty:${collection.id}`, label: 'Empty', depth: depth + 1, className: EMPTY_ROW_CLASS });
        }
        pushScripts(scripts, depth + 1, collection);
    };

    const pushTemporarySection = () => {
        if (temporaryCollections.length === 0) return;
        rows.push({ kind: 'header', key: 'header:temporary', label: 'Temporary', className: 'px-2 py-2 text-xs font-semibold text-amber-500 uppercase' });
        temporaryCollections.forEach(c => pushFlatCollection(c, 0));
    };

    if (isOpsMode && !searchActive) {
        // === Ops Mode: 3-level Project → Collection → Script hierarchy ===
        pushTemporarySection();

        for (const project of projects) {
            rows.push({ kind: 'project', key: `proj:${project.id}`, project });
            if (!expandedProjects[project.id]) continue;
            const roots = collectionsByTreeKey[getCollectionTreeKey(null, project.id)] ?? [];
            roots.forEach(c => pushCollectionTree(c, 1, project.id));
            if ((projectCollectionCounts[project.id] ?? 0) === 0) {
                rows.push({ kind: 'empty', key: `empty-proj:${project.id}`, label: 'No collections', depth: 1, className: NO_COLLECTIONS_ROW_CLASS });
            }
        }

        // Unassigned collections + scripts
        if (rootSavedCollections.length > 0 || unsortedScripts.length > 0) {
            rows.push({ kind: 'header', key: 'header:unassigned', label: 'Unassigned', className: 'px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-2 mb-1' });
            rootSavedCollections.forEach(c => pushCollectionTree(c, 0, null));
            pushScripts(unsortedScripts, 0, null);
        }
    } else {
        // === Normal Mode (or search active): flat collection → script view ===
        pushTemporarySection();

        if (searchActive ? savedCollections.length > 0 : rootSavedCollections.length > 0) {
            rows.push({ kind: 'header', key: 'header:collections', label: temporaryCollections.length > 0 ? 'Collections' : '', className: 'px-2 py-2 text-xs font-semibold text-slate-400 uppercase' });
        }

        if (searchActive) {
            savedCollections.forEach(c => pushFlatCollection(c, 0));
        } else {
            rootSavedCollections.forEach(c => pushCollectionTree(c, 0, null));
        }

        if (unsortedScripts.length > 0) {
            rows.push({ kind: 'header', key: 'header:unsorted', label: 'Unsorted', className: 'px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-2 mb-1' });
            pushScripts(unsortedScripts, 0, null);
        }
    }

    return rows;
}

// --- Row components ------------------------------------------------------

// Draggable Script row — also a droppable proxying its parent collection so that
// dropping onto a script inside an expanded collection still targets that collection
// (the pre-virtualization markup achieved this by nesting rows inside the
// collection's droppable wrapper).
const ScriptRow = memo(({
    script,
    isActive,
    parentCollection,
    callbacks,
}: {
    script: Script;
    isActive: boolean;
    parentCollection: Collection | null;
    callbacks: ScriptTreeCallbacks;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: script.id,
        data: { type: 'script', script }
    });
    const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
        id: `drop-script-${script.id}`,
        data: parentCollection ? { type: 'collection', collection: parentCollection } : undefined,
        disabled: !parentCollection,
    });

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={(node) => { setNodeRef(node); setDroppableNodeRef(node); }}
                    style={{ opacity: isDragging ? 0.5 : 1 }}
                    {...attributes}
                    {...listeners}
                    onClick={() => callbacks.onActivateScript(script.id)}
                    className={cn(
                        "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors select-none",
                        isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                        isDragging && "opacity-50 bg-slate-50 dark:bg-slate-800",
                        isOver && "bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-200 dark:ring-blue-800"
                    )}
                >
                    <div className="w-4 flex-shrink-0" />
                    <FileCode className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500")} />
                    <span className="truncate text-[13px] flex-1">{script.name}<UnsavedIndicator scriptId={script.id} /></span>
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => callbacks.onDuplicateScript(script.id)}>
                    <Copy className="mr-2 h-4 w-4" /> Duplicate
                </ContextMenuItem>
                <ContextMenuItem onClick={() => callbacks.onSaveAsTemplate(script)}>
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Save as Template
                </ContextMenuItem>
                <DropdownMenuSeparator />
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={() => callbacks.onDeleteScript(script)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Script
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});
ScriptRow.displayName = 'ScriptRow';

// Droppable + draggable collection header row
const CollectionRow = memo(({
    collection,
    isExpanded,
    isDeleting,
    canManagePythonEnv,
    callbacks,
}: {
    collection: Collection;
    isExpanded: boolean;
    isDeleting: boolean;
    canManagePythonEnv: boolean;
    callbacks: ScriptTreeCallbacks;
}) => {
    const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
        id: `drop-col-${collection.id}`,
        data: { type: 'collection', collection }
    });

    const { attributes, listeners, setNodeRef: setDraggableNodeRef, isDragging } = useDraggable({
        id: `drag-col-${collection.id}`,
        data: { type: 'collection', collection }
    });

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={(node) => { setDroppableNodeRef(node); setDraggableNodeRef(node); }}
                    className={cn(
                        "flex items-center gap-1 px-1.5 py-1.5 text-sm font-medium rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 group cursor-pointer transition-colors",
                        isDragging && "opacity-50 line-through",
                        isOver && "bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-200 dark:ring-blue-800"
                    )}
                    onClick={() => callbacks.onToggleCollection(collection.id)}
                >
                    <div className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                        {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )}
                    </div>
                    <Folder className={cn("h-4 w-4 flex-shrink-0", isOver ? "text-blue-500" : "text-slate-500")} />
                    <span className="min-w-0 flex-1 truncate pr-1 text-[13px] leading-5 text-slate-700 dark:text-slate-300" title={collection.name}>
                        {collection.name}
                        {collection.storage_provider_id && (
                            <span title="Cloud-bound collection" aria-label="Cloud-bound collection">
                                <Cloud className="ml-1 inline-block h-3 w-3 align-[-1px] text-muted-foreground" />
                            </span>
                        )}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                        <CollectionLinkStatusDot hasLinkedFolder={Boolean(collection.folder_path)} isTemporary={Boolean(collection.is_temporary)} />
                        {isDeleting && (
                            <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-500" />
                        )}
                        <div className="flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 group-hover:max-w-20 group-hover:opacity-100 group-focus-within:max-w-20 group-focus-within:opacity-100">
                            <button
                                type="button"
                                {...attributes}
                                {...listeners}
                                className="flex h-5 w-5 items-center justify-center rounded-sm text-slate-300 transition-colors hover:text-slate-500 cursor-grab active:cursor-grabbing"
                                onClick={(e) => e.stopPropagation()}
                                title="Drag collection"
                                aria-label={`Drag collection ${collection.name}`}
                            >
                                <GripVertical className="h-3.5 w-3.5 flex-shrink-0" />
                            </button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                                onClick={(e) => { e.stopPropagation(); callbacks.onCreateScript(collection.id); }}
                                title="New Script"
                                disabled={isDeleting}
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={isDeleting}
                                    >
                                        <MoreVertical className="h-3 w-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onCreateScript(collection.id); }}>
                                        <Plus className="mr-2 h-4 w-4" /> New Script
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onCreateCollection(collection.project_id, collection.id); }}>
                                        <Folder className="mr-2 h-4 w-4" /> New Sub-collection
                                    </DropdownMenuItem>
                                    {collection.is_temporary && (
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onConvertCollection(collection); }}>
                                            <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                                        </DropdownMenuItem>
                                    )}
                                    {canManagePythonEnv && (
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onManagePythonEnv(collection); }}>
                                            <Folder className="mr-2 h-4 w-4" /> Python Environment...
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onCloudStorage(collection); }}>
                                        <Cloud className="mr-2 h-4 w-4" /> Cloud storage...
                                    </DropdownMenuItem>
                                    {collection.storage_provider_id && (
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); callbacks.onSyncCollection(collection); }}>
                                            <RefreshCw className="mr-2 h-4 w-4" /> Sync now
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); callbacks.onDeleteCollection(collection); }}>
                                        <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete'}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={() => callbacks.onCreateScript(collection.id)}>
                    <Plus className="mr-2 h-4 w-4" /> New Script here
                </ContextMenuItem>
                <ContextMenuItem onClick={() => callbacks.onCreateCollection(collection.project_id, collection.id)}>
                    <Folder className="mr-2 h-4 w-4" /> New Sub-collection here
                </ContextMenuItem>
                {collection.is_temporary && (
                    <ContextMenuItem onClick={() => callbacks.onConvertCollection(collection)}>
                        <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                    </ContextMenuItem>
                )}
                {canManagePythonEnv && (
                    <ContextMenuItem onClick={() => callbacks.onManagePythonEnv(collection)}>
                        <Folder className="mr-2 h-4 w-4" /> Python Environment...
                    </ContextMenuItem>
                )}
                <ContextMenuItem onClick={() => callbacks.onCloudStorage(collection)}>
                    <Cloud className="mr-2 h-4 w-4" /> Cloud storage...
                </ContextMenuItem>
                {collection.storage_provider_id && (
                    <ContextMenuItem onClick={() => callbacks.onSyncCollection(collection)}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Sync now
                    </ContextMenuItem>
                )}
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={() => callbacks.onDeleteCollection(collection)}>
                    <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete Collection'}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});
CollectionRow.displayName = 'CollectionRow';

// Droppable project header row
const ProjectRow = memo(({
    project,
    isExpanded,
    callbacks,
}: {
    project: Project;
    isExpanded: boolean;
    callbacks: ScriptTreeCallbacks;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: `drop-proj-${project.id}`,
        data: { type: 'project', project }
    });

    const envLabels: Record<string, string> = {
        development: 'DEV',
        qa: 'QA',
        uat: 'UAT',
        production: 'PROD',
    };

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 group cursor-pointer transition-colors",
                isOver && "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800"
            )}
            onClick={() => callbacks.onToggleProject(project.id)}
        >
            <div className="flex h-4 w-4 items-center justify-center shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            </div>
            <Layers className="h-4 w-4 flex-shrink-0" style={{ color: project.color }} />
            <span className="flex-1 truncate text-[13px] text-slate-700 dark:text-slate-300">{project.name}</span>
            <span
                className="text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                style={{ backgroundColor: project.color + '22', color: project.color }}
            >
                {envLabels[project.environment] ?? project.environment.toUpperCase()}
            </span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <MoreVertical className="h-3 w-3" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); callbacks.onCreateScript(); }}>
                        <FileCode className="mr-2 h-4 w-4" /> New Script
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={e => { e.stopPropagation(); callbacks.onCreateCollection(project.id); }}>
                        <Folder className="mr-2 h-4 w-4" /> New Collection
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={e => { e.stopPropagation(); callbacks.onDeleteProject(project.id); }}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
});
ProjectRow.displayName = 'ProjectRow';

// --- ScriptTree ------------------------------------------------------------

export interface ScriptTreeProps extends FlattenTreeArgs {
    activeScriptId: string | null;
    pendingCollectionDeleteId: string | null;
    hasDesktopFolderPicker: boolean;
    isLoading: boolean;
    noMatchMessage: string | null;
    callbacks: ScriptTreeCallbacks;
}

const ScriptTreeComponent = (props: ScriptTreeProps) => {
    const {
        activeScriptId, pendingCollectionDeleteId, hasDesktopFolderPicker,
        isLoading, noMatchMessage, callbacks,
        isOpsMode, searchActive,
        temporaryCollections, savedCollections, collectionsByTreeKey, rootSavedCollections,
        projects, projectCollectionCounts, scriptsByCollection, unsortedScripts,
        expandedCollections, expandedProjects,
    } = props;

    const parentRef = useRef<HTMLDivElement | null>(null);

    const rows = useMemo(() => flattenTree({
        isOpsMode, searchActive,
        temporaryCollections, savedCollections, collectionsByTreeKey, rootSavedCollections,
        projects, projectCollectionCounts, scriptsByCollection, unsortedScripts,
        expandedCollections, expandedProjects,
    }), [
        isOpsMode, searchActive,
        temporaryCollections, savedCollections, collectionsByTreeKey, rootSavedCollections,
        projects, projectCollectionCounts, scriptsByCollection, unsortedScripts,
        expandedCollections, expandedProjects,
    ]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => {
            switch (rows[index].kind) {
                case 'collection': return 32;
                case 'project': return 32;
                case 'script': return 30;
                case 'header': return 32;
                case 'empty': return 24;
            }
        },
        overscan: 12,
        getItemKey: (index) => rows[index].key,
    });

    // Scroll the active script row into view when activation comes from outside
    // (e.g. QuickSwitcher) and the row is not currently visible.
    const rowsRef = useRef(rows);
    rowsRef.current = rows;
    useEffect(() => {
        if (!activeScriptId) return;
        const index = rowsRef.current.findIndex(
            (row) => row.kind === 'script' && row.script.id === activeScriptId
        );
        if (index >= 0) {
            virtualizer.scrollToIndex(index, { align: 'auto' });
        }
        // Only react to active script changes — not to expand/collapse reshuffles.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeScriptId]);

    const renderRow = (row: TreeRow) => {
        switch (row.kind) {
            case 'header':
                return <div className={row.className}>{row.label}</div>;
            case 'project':
                return (
                    <ProjectRow
                        project={row.project}
                        isExpanded={!!expandedProjects[row.project.id]}
                        callbacks={callbacks}
                    />
                );
            case 'collection':
                return (
                    <div style={{ paddingLeft: row.depth * INDENT_PX }}>
                        <CollectionRow
                            collection={row.collection}
                            isExpanded={!!expandedCollections[row.collection.id]}
                            isDeleting={pendingCollectionDeleteId === row.collection.id}
                            canManagePythonEnv={hasDesktopFolderPicker && Boolean(row.collection.folder_path)}
                            callbacks={callbacks}
                        />
                    </div>
                );
            case 'script':
                return (
                    <div style={{ paddingLeft: row.depth * INDENT_PX }}>
                        <ScriptRow
                            script={row.script}
                            isActive={activeScriptId === row.script.id}
                            parentCollection={row.parentCollection}
                            callbacks={callbacks}
                        />
                    </div>
                );
            case 'empty':
                return (
                    <div style={{ paddingLeft: row.depth * INDENT_PX }}>
                        <div className={row.className}>{row.label}</div>
                    </div>
                );
        }
    };

    return (
        <div ref={parentRef} className="flex-1 overflow-y-auto p-2">
            {isLoading && (
                <div className="flex justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
            )}
            {noMatchMessage && (
                <div className="px-2 py-6 text-xs text-slate-400 text-center italic">{noMatchMessage}</div>
            )}
            <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const row = rows[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <div className="pb-0.5">{renderRow(row)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
ScriptTreeComponent.displayName = 'ScriptTree';

export const ScriptTree = memo(ScriptTreeComponent);
