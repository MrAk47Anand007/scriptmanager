'use client'

import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, type ChangeEvent } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import type { RootState } from '@/store/store';
import {
    setActiveScript, createScript, createCollection, deleteCollection, moveScript, moveCollection,
    saveAsTemplate, duplicateScript, deleteScript, openScriptsFolder, importScriptsFolder,
    removeTemporaryCollection, convertTemporaryCollection,
} from '@/features/scripts/scriptsSlice';
import type { Script, Collection, ScriptTemplate } from '@/features/scripts/scriptsSlice';
import {
    createProject, deleteProject,
} from '@/features/ops/opsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    FileCode, Plus, Folder, MoreVertical, Trash2, ChevronRight, ChevronDown,
    GripVertical, Search, LayoutTemplate, Copy, Loader2, Layers, FolderOpen,
} from 'lucide-react';
import { QuickSwitcher } from './QuickSwitcher';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable, DragStartEvent, useSensors, useSensor, PointerSensor } from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import axios from 'axios';

type BrowserFolderFile = {
    relativePath: string
    content: string
}

const GistSyncStatus = () => {
    const { settings } = useAppSelector((state) => state.settings);
    const isEnabled = settings['gist_sync_enabled'] === 'true';

    return (
        <span className={cn("font-medium", isEnabled ? "text-green-600" : "text-slate-400")}>
            {isEnabled ? "Auto" : "Manual"}
        </span>
    );
};

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

// Draggable Script Component
const DraggableScript = ({
    script,
    isActive,
    onClick,
    onSaveAsTemplate,
    onDuplicate,
    onDelete,
}: {
    script: Script;
    isActive: boolean;
    onClick: () => void;
    onSaveAsTemplate: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: script.id,
        data: { type: 'script', script }
    });

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    ref={setNodeRef}
                    style={{ opacity: isDragging ? 0.5 : 1 }}
                    {...attributes}
                    {...listeners}
                    onClick={onClick}
                    className={cn(
                        "group flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors select-none",
                        isActive ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                        isDragging && "opacity-50 bg-slate-50 dark:bg-slate-800"
                    )}
                >
                    <FileCode className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate text-xs flex-1">{script.name}<UnsavedIndicator scriptId={script.id} /></span>
                    <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onDuplicate}>
                    <Copy className="mr-2 h-4 w-4" /> Duplicate
                </ContextMenuItem>
                <ContextMenuItem onClick={onSaveAsTemplate}>
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Save as Template
                </ContextMenuItem>
                <DropdownMenuSeparator />
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Script
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

// Droppable Collection Component
const DroppableCollection = ({
    collection,
    isExpanded,
    toggle,
    children,
    onDelete,
    onCreateScript,
    onConvertToCollection,
}: {
    collection: Collection,
    isExpanded: boolean,
    toggle: () => void,
    children: React.ReactNode,
    onDelete: () => void,
    onCreateScript: () => void
    onConvertToCollection?: () => void
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
            <ContextMenuTrigger>
                <div ref={setDroppableNodeRef} className={cn("space-y-0.5 rounded-md transition-colors", isOver && "bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-200 dark:ring-blue-800")}>
                    <div
                        ref={setDraggableNodeRef}
                        {...attributes}
                        {...listeners}
                        className={cn("flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 group cursor-pointer", isDragging && "opacity-50 line-through")}
                        onClick={toggle}
                    >
                        <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                        )}
                        <Folder className={cn("h-4 w-4 flex-shrink-0", isOver ? "text-blue-500" : "text-slate-500")} />
                        <span className="truncate flex-1 min-w-0 text-slate-700 dark:text-slate-300" title={collection.name}>{collection.name}</span>
                        {collection.folder_path && (
                            <span className="shrink-0 text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                                {collection.is_temporary ? 'temp' : 'linked'}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                            onClick={(e) => { e.stopPropagation(); onCreateScript(); }}
                            title="New Script"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <MoreVertical className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateScript(); }}>
                                    <Plus className="mr-2 h-4 w-4" /> New Script
                                </DropdownMenuItem>
                                {collection.is_temporary && onConvertToCollection && (
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvertToCollection(); }}>
                                        <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                                    <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete'}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    {isExpanded && (
                        <div className="pl-4 space-y-0.5">
                            {children}
                        </div>
                    )}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onCreateScript}>
                    <Plus className="mr-2 h-4 w-4" /> New Script here
                </ContextMenuItem>
                {collection.is_temporary && onConvertToCollection && (
                    <ContextMenuItem onClick={onConvertToCollection}>
                        <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                    </ContextMenuItem>
                )}
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete Collection'}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

// Droppable Project Component
const DroppableProject = ({
    project,
    isExpanded,
    toggleProject,
    handleCreateScript,
    handleCreateCollection,
    handleDeleteProject,
    children
}: {
    project: any;
    isExpanded: boolean;
    toggleProject: () => void;
    handleCreateScript: () => void;
    handleCreateCollection: () => void;
    handleDeleteProject: () => void;
    children: React.ReactNode;
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
        <div ref={setNodeRef} className={cn("space-y-0.5 rounded-md transition-colors", isOver && "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800")}>
            <div
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 group cursor-pointer"
                onClick={toggleProject}
            >
                {isExpanded ? <ChevronDown className="h-3 w-3 text-slate-400 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                <Layers className="h-3.5 w-3.5 flex-shrink-0" style={{ color: project.color }} />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{project.name}</span>
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
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); handleCreateScript(); }}>
                            <FileCode className="mr-2 h-4 w-4" /> New Script
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={e => { e.stopPropagation(); handleCreateCollection(); }}>
                            <Folder className="mr-2 h-4 w-4" /> New Collection
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={e => { e.stopPropagation(); handleDeleteProject(); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {isExpanded && (
                <div className="pl-3 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    );
};

export const ScriptsSidebar = () => {
    const dispatch = useAppDispatch();
    const store = useAppStore();
    const {
        items: scripts,
        collections,
        activeScriptId,
        // Removed activeScriptContent to prevent re-renders on keystroke
        templates,
        allTags,
        status,
    } = useAppSelector((state) => state.scripts);
    const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [parentProjectId, setParentProjectId] = useState<string | null>(null);
    const [activeDragScript, setActiveDragScript] = useState<Script | null>(null);
    const [activeDragCollection, setActiveDragCollection] = useState<Collection | null>(null);

    // New Script Dialog State
    const [isCreateScriptOpen, setIsCreateScriptOpen] = useState(false);
    const [newScriptName, setNewScriptName] = useState('');
    const [newScriptDescription, setNewScriptDescription] = useState('');
    const [isCreatingScript, setIsCreatingScript] = useState(false);
    const [parentCollectionId, setParentCollectionId] = useState<string | null>(null);
    const [syncToGistOverride, setSyncToGistOverride] = useState(false);
    const [isOpenFolderDialogOpen, setIsOpenFolderDialogOpen] = useState(false);
    const [folderPath, setFolderPath] = useState('');
    const [folderMode, setFolderMode] = useState<'temporary' | 'collection'>('temporary');
    const [folderCollectionName, setFolderCollectionName] = useState('');
    const [isOpeningFolder, setIsOpeningFolder] = useState(false);
    const [openFolderError, setOpenFolderError] = useState('');
    const [browserFolderFiles, setBrowserFolderFiles] = useState<BrowserFolderFile[]>([]);
    const filePickerRef = useRef<HTMLInputElement | null>(null);
    const [collectionToConvert, setCollectionToConvert] = useState<Collection | null>(null);
    const [convertCollectionName, setConvertCollectionName] = useState('');
    const [isConvertingCollection, setIsConvertingCollection] = useState(false);

    // Search + filter state
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
    const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

    // Template picker state
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

    // Save as Template dialog state
    const [isSaveAsTemplateOpen, setIsSaveAsTemplateOpen] = useState(false);
    const [saveAsSourceScript, setSaveAsSourceScript] = useState<Script | null>(null);
    const [saveAsTemplateName, setSaveAsTemplateName] = useState('');
    const [saveAsDescription, setSaveAsDescription] = useState('');
    const [saveAsCategory, setSaveAsCategory] = useState('general');
    const [saveAsError, setSaveAsError] = useState('');
    const [saveAsLoading, setSaveAsLoading] = useState(false);

    // Delete confirmation dialog state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [scriptToDelete, setScriptToDelete] = useState<Script | null>(null);
    const [deleteFromGist, setDeleteFromGist] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const { settings } = useAppSelector((state) => state.settings);
    const isModeActive = useAppSelector((state) => state.ops.isModeActive);
    const { projects } = useAppSelector((state) => state.ops);
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectEnv, setNewProjectEnv] = useState<'development' | 'qa' | 'uat' | 'production'>('development');

    const toggleProject = (id: string) => {
        setExpandedProjects(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleCreateProject = async () => {
        if (!newProjectName.trim()) return;
        const envColors: Record<string, string> = {
            development: '#22c55e',
            qa: '#3b82f6',
            uat: '#f59e0b',
            production: '#ef4444',
        };
        await dispatch(createProject({
            name: newProjectName.trim(),
            environment: newProjectEnv,
            color: envColors[newProjectEnv] ?? '#6366f1',
        }));
        setNewProjectName('');
        setIsCreatingProject(false);
    };

    const handleDeleteProject = async (id: string) => {
        if (confirm('Delete this project? Collections will become unassigned (not deleted).')) {
            await dispatch(deleteProject(id));
        }
    };

    // Ctrl+P / Cmd+P global shortcut
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            setQuickSwitcherOpen(true);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    useEffect(() => {
        const openFolderFromDesktopMenu = () => {
            openFolderDialog();
        };

        window.addEventListener('scriptmanager:desktop-open-folder', openFolderFromDesktopMenu as EventListener);
        return () => {
            window.removeEventListener('scriptmanager:desktop-open-folder', openFolderFromDesktopMenu as EventListener);
        };
    }, []);

    // Initial data fetching is centralized in page.tsx

    // Initialize sync override based on global setting when opening dialog
    useEffect(() => {
        if (isCreateScriptOpen) {
            setSyncToGistOverride(settings['gist_sync_enabled'] === 'true');
            setNewScriptName('');
            setNewScriptDescription('');
            setIsCreatingScript(false);
        }
    }, [isCreateScriptOpen, settings]);

    const toggleCollection = (id: string) => {
        setExpandedCollections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleDeleteScriptRequest = (script: Script) => {
        setScriptToDelete(script);
        setDeleteFromGist(script.sync_to_gist || !!script.gist_id);
        setIsDeleteDialogOpen(true);
    };

    const confirmDeleteScript = async () => {
        if (!scriptToDelete) return;

        setIsDeleting(true);
        try {
            await dispatch(deleteScript({ id: scriptToDelete.id, deleteGist: deleteFromGist }));
            setIsDeleteDialogOpen(false);
            setScriptToDelete(null);
        } catch (error) {
            console.error('Failed to delete script:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const openCreateScriptDialog = (collectionId?: string) => {
        setParentCollectionId(collectionId || null);
        setIsCreateScriptOpen(true);
    };

    const openFolderDialog = () => {
        setFolderMode('temporary');
        setFolderPath('');
        setFolderCollectionName('');
        setOpenFolderError('');
        setBrowserFolderFiles([]);
        setIsOpenFolderDialogOpen(true);
    };

    const selectFolderPath = async () => {
        setOpenFolderError('');

        if (window.scriptManagerDesktop?.selectFolder) {
            const selected = await window.scriptManagerDesktop.selectFolder();
            if (selected) {
                setFolderPath(selected);
                if (!folderCollectionName.trim()) {
                    const parts = selected.split(/[\\/]/).filter(Boolean);
                    setFolderCollectionName(parts[parts.length - 1] ?? '');
                }
            }
            return;
        }

        filePickerRef.current?.click();
    };

    const handleFolderInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []) as Array<File & { webkitRelativePath?: string }>;
        if (selectedFiles.length === 0) return;

        setOpenFolderError('');

        const folderRoot = selectedFiles[0].webkitRelativePath?.split('/')[0] || 'Imported Folder';
        const loadedFiles = await Promise.all(
            selectedFiles
                .filter((file) => file.webkitRelativePath)
                .map(async (file) => ({
                    relativePath: file.webkitRelativePath!,
                    content: await file.text(),
                }))
        );

        setBrowserFolderFiles(loadedFiles);
        setFolderPath(folderRoot);
        if (!folderCollectionName.trim()) {
            setFolderCollectionName(folderRoot);
        }

        event.target.value = '';
    };

    const handleOpenFolderSubmit = async () => {
        if (!folderPath.trim() || isOpeningFolder) return;

        setIsOpeningFolder(true);
        setOpenFolderError('');
        try {
            const result = window.scriptManagerDesktop?.selectFolder
                ? await dispatch(openScriptsFolder({
                    folderPath: folderPath.trim(),
                    mode: folderMode,
                    collectionName: folderMode === 'collection' ? folderCollectionName.trim() || undefined : undefined,
                }))
                : await dispatch(importScriptsFolder({
                    mode: folderMode,
                    folderName: folderPath.trim(),
                    collectionName: folderMode === 'collection' ? folderCollectionName.trim() || undefined : undefined,
                    files: browserFolderFiles,
                }));

            if (openScriptsFolder.fulfilled.match(result) || importScriptsFolder.fulfilled.match(result)) {
                const firstScriptId = result.payload.scripts[0]?.id;
                if (result.payload.collection?.id) {
                    setExpandedCollections((prev) => ({ ...prev, [result.payload.collection.id]: true }));
                }
                if (firstScriptId) {
                    dispatch(setActiveScript(firstScriptId));
                }
                setIsOpenFolderDialogOpen(false);
            } else {
                const message = typeof result.payload === 'string'
                    ? result.payload
                    : (result.error?.message || 'Failed to open folder');
                setOpenFolderError(message);
            }
        } finally {
            setIsOpeningFolder(false);
        }
    };

    const handleCreateScriptSubmit = async () => {
        if (!newScriptName.trim() || isCreatingScript) return;

        setIsCreatingScript(true);
        try {
            let content = '';
            let language = 'python';

            const lowerName = newScriptName.toLowerCase();
            if (lowerName.endsWith('.py')) {
                language = 'python';
                content = 'print("Hello World")';
            } else if (lowerName.endsWith('.js') || lowerName.endsWith('.ts')) {
                language = 'node';
                content = 'console.log("Hello World");';
            } else if (lowerName.endsWith('.sh')) {
                language = 'shell';
                content = '#!/bin/bash\necho "Hello World"';
            }

            const result = await dispatch(createScript({
                name: newScriptName,
                description: newScriptDescription.trim() || undefined,
                syncToGist: syncToGistOverride,
                content,
                language,
                collectionId: parentCollectionId,
            }));

            if (createScript.fulfilled.match(result)) {
                if (parentCollectionId) {
                    setExpandedCollections(prev => ({ ...prev, [parentCollectionId]: true }));
                }
                setIsCreateScriptOpen(false);
                setNewScriptName('');
                setNewScriptDescription('');
            }
        } finally {
            setIsCreatingScript(false);
        }
    };

    const handleCreateScript = async (collectionId?: string) => {
        openCreateScriptDialog(collectionId);
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        await dispatch(createCollection({ name: newCollectionName.trim(), projectId: parentProjectId }));
        setNewCollectionName('');
        setIsCreatingCollection(false);
        setParentProjectId(null);
    };

    const handleDeleteCollection = async (id: string) => {
        if (confirm("Delete this collection? Scripts inside will be moved to Unsorted.")) {
            await dispatch(deleteCollection(id));
        }
    };

    const handleRemoveTemporaryCollection = async (collection: Collection) => {
        if (!confirm(`Remove temporary workspace "${collection.name}" from ScriptManager?`)) {
            return;
        }
        await dispatch(removeTemporaryCollection(collection.id));
    };

    const openConvertCollectionDialog = (collection: Collection) => {
        setCollectionToConvert(collection);
        setConvertCollectionName(collection.name.replace(/\s+\(Temporary\)$/i, ''));
    };

    const handleConvertTemporaryCollection = async () => {
        if (!collectionToConvert || !convertCollectionName.trim() || isConvertingCollection) return;
        setIsConvertingCollection(true);
        try {
            const result = await dispatch(convertTemporaryCollection({
                id: collectionToConvert.id,
                name: convertCollectionName.trim(),
            }));
            if (convertTemporaryCollection.fulfilled.match(result)) {
                setCollectionToConvert(null);
                setConvertCollectionName('');
            }
        } finally {
            setIsConvertingCollection(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current;
        if (data?.type === 'script') {
            setActiveDragScript(data.script);
        } else if (data?.type === 'collection') {
            setActiveDragCollection(data.collection);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragScript(null);
        setActiveDragCollection(null);

        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        if (activeData?.type === 'script' && overData?.type === 'collection') {
            const scriptId = activeData.script.id;
            const collectionId = overData.collection.id;
            if (activeData.script.collection_id !== collectionId) {
                await dispatch(moveScript({ scriptId, collectionId }));
                setExpandedCollections(prev => ({ ...prev, [collectionId]: true }));
            }
        } else if (activeData?.type === 'collection' && overData?.type === 'project') {
            const collectionId = activeData.collection.id;
            const projectId = overData.project.id;
            if (activeData.collection.project_id !== projectId) {
                await dispatch(moveCollection({ collectionId, projectId }));
                setExpandedProjects(prev => ({ ...prev, [projectId]: true }));
            }
        }
    };

    // --- Template handlers ---

    const openSaveAsTemplate = (script: Script) => {
        setSaveAsSourceScript(script);
        setSaveAsTemplateName(script.name);
        setSaveAsDescription('');
        setSaveAsCategory('general');
        setSaveAsError('');
        setSaveAsLoading(false);
        setIsSaveAsTemplateOpen(true);
    };

    const handleSaveAsTemplate = async () => {
        if (!saveAsSourceScript || !saveAsTemplateName.trim()) return;
        setSaveAsLoading(true);
        setSaveAsError('');

        try {
            // Get content: use active script content if this is the active script, else fetch
            let content: string
            const state = store.getState() as RootState; // Get latest state
            if (saveAsSourceScript.id === activeScriptId && state.scripts.activeScriptContent) {
                content = state.scripts.activeScriptContent
            } else {
                const res = await axios.get(`/api/scripts/${saveAsSourceScript.id}`)
                content = res.data.content ?? ''
            }

            const result = await dispatch(saveAsTemplate({
                name: saveAsTemplateName.trim(),
                description: saveAsDescription.trim(),
                category: saveAsCategory,
                language: saveAsSourceScript.language ?? 'python',
                interpreter: saveAsSourceScript.interpreter ?? null,
                content,
                parameters: saveAsSourceScript.parameters,
            }))

            if (saveAsTemplate.fulfilled.match(result)) {
                setIsSaveAsTemplateOpen(false)
            } else if (saveAsTemplate.rejected.match(result)) {
                const payload = result.payload as { error?: string } | undefined
                setSaveAsError(payload?.error ?? 'Failed to save template')
            }
        } catch {
            setSaveAsError('Failed to save template')
        } finally {
            setSaveAsLoading(false)
        }
    };

    const handleCreateFromTemplate = async (tpl: ScriptTemplate, name: string) => {
        setIsTemplatePickerOpen(false);
        const result = await dispatch(createScript({
            name,
            content: tpl.content,
            language: tpl.language,
            interpreter: tpl.interpreter ?? null,
            parameters: tpl.parameters,
        }));
        if (createScript.fulfilled.match(result) && parentCollectionId) {
            await dispatch(moveScript({ scriptId: result.payload.id, collectionId: parentCollectionId }));
            setExpandedCollections(prev => ({ ...prev, [parentCollectionId]: true }));
        }
    };

    const filteredScripts = useMemo(() => {
        let result = scripts;
        if (selectedTagId) {
            result = result.filter(s => s.tags?.some(t => t.id === selectedTagId));
        }
        if (!deferredSearchQuery.trim()) return result;
        const q = deferredSearchQuery.toLowerCase();
        return result.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.description ?? '').toLowerCase().includes(q)
        );
    }, [deferredSearchQuery, scripts, selectedTagId]);

    // Auto-expand collections that contain matching scripts when searching or filtering
    useEffect(() => {
        if (!deferredSearchQuery.trim() && !selectedTagId) return;
        const toExpand: Record<string, boolean> = {};
        filteredScripts.forEach(s => {
            if (s.collection_id) toExpand[s.collection_id] = true;
        });
        setExpandedCollections(prev => ({ ...prev, ...toExpand }));
    }, [deferredSearchQuery, filteredScripts, selectedTagId]);

    const grouped = useMemo(() => {
        const result: Record<string, typeof scripts> = {};
        const unsorted: typeof scripts = [];

        collections.forEach(c => {
            result[c.id] = [];
        });

        filteredScripts.forEach(s => {
            if (s.collection_id && result[s.collection_id]) {
                result[s.collection_id].push(s);
            } else {
                unsorted.push(s);
            }
        });

        return { result, unsorted };
    }, [filteredScripts, collections]);

    const temporaryCollections = useMemo(
        () => collections.filter((collection) => collection.is_temporary),
        [collections]
    );

    const savedCollections = useMemo(
        () => collections.filter((collection) => !collection.is_temporary),
        [collections]
    );

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    return (
        <>
            <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
            <TemplatePickerDialog
                open={isTemplatePickerOpen}
                templates={templates}
                onClose={() => setIsTemplatePickerOpen(false)}
                onSelect={handleCreateFromTemplate}
            />
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="bg-white dark:bg-slate-950 border-r dark:border-slate-800 flex flex-col h-full">
                    <div className="p-3 border-b dark:border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Scripts</h2>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openFolderDialog} title="Open local folder">
                                    <FolderOpen className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQuickSwitcherOpen(true)}>
                                    <Search className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <Plus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleCreateScript()}>
                                            <FileCode className="mr-2 h-4 w-4" /> New Script
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setIsTemplatePickerOpen(true)}>
                                            <LayoutTemplate className="mr-2 h-4 w-4" /> New from Template
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => { setParentProjectId(null); setIsCreatingCollection(true); }}>
                                            <Folder className="mr-2 h-4 w-4" /> New Collection
                                        </DropdownMenuItem>
                                        {isModeActive && (
                                            <DropdownMenuItem onClick={() => setIsCreatingProject(true)}>
                                                <Layers className="mr-2 h-4 w-4" /> New Project
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        {/* Inline search bar */}
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                            <Input
                                placeholder="Filter scripts..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-7 pl-8 text-xs bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                            />
                        </div>

                        {/* Tag filter chips */}
                        {allTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {allTags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
                                        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-all"
                                        style={
                                            selectedTagId === tag.id
                                                ? { backgroundColor: tag.color, color: '#fff', border: `1px solid ${tag.color}` }
                                                : { backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }
                                        }
                                    >
                                        {tag.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {isCreatingCollection && (
                        <div className="p-2 border-b bg-blue-50 dark:bg-blue-900/20 dark:border-slate-800">
                            <Input
                                autoFocus
                                placeholder="Collection Name"
                                value={newCollectionName}
                                onChange={(e) => setNewCollectionName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                                className="h-7 text-xs mb-2 bg-white dark:bg-slate-950 dark:border-slate-700"
                            />
                            <div className="flex gap-2">
                                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreateCollection}>Create</Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => setIsCreatingCollection(false)}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    {isModeActive && isCreatingProject && (
                        <div className="p-2 border-b bg-amber-50 dark:bg-amber-900/20 dark:border-slate-800">
                            <Input
                                autoFocus
                                placeholder="Project Name"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
                                className="h-7 text-xs mb-2 bg-white dark:bg-slate-950 dark:border-slate-700"
                            />
                            <Select value={newProjectEnv} onValueChange={(v) => setNewProjectEnv(v as typeof newProjectEnv)}>
                                <SelectTrigger className="h-7 text-xs mb-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="development">Development</SelectItem>
                                    <SelectItem value="qa">QA</SelectItem>
                                    <SelectItem value="uat">UAT</SelectItem>
                                    <SelectItem value="production">Production</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex gap-2">
                                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreateProject}>Create</Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => setIsCreatingProject(false)}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {status === 'loading' && (
                            <div className="flex justify-center p-4">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                            </div>
                        )}
                        {searchQuery.trim() && filteredScripts.length === 0 && status !== 'loading' && (
                            <div className="px-2 py-6 text-xs text-slate-400 text-center italic">No scripts match &quot;{searchQuery}&quot;</div>
                        )}

                        {/* === Ops Mode: 3-level Project → Collection → Script hierarchy === */}
                        {isModeActive && !searchQuery.trim() && (
                            <>
                                {temporaryCollections.length > 0 && (
                                    <>
                                        <div className="px-2 py-2 text-xs font-semibold text-amber-500 uppercase">Temporary</div>
                                        {temporaryCollections.map(collection => (
                                            <DroppableCollection
                                                key={collection.id}
                                                collection={collection}
                                                isExpanded={!!expandedCollections[collection.id]}
                                                toggle={() => toggleCollection(collection.id)}
                                                onDelete={() => handleRemoveTemporaryCollection(collection)}
                                                onCreateScript={() => handleCreateScript(collection.id)}
                                                onConvertToCollection={() => openConvertCollectionDialog(collection)}
                                            >
                                                {grouped.result[collection.id]?.length === 0 && (
                                                    <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>
                                                )}
                                                {(grouped.result[collection.id] ?? []).map(script => (
                                                    <DraggableScript
                                                        key={script.id}
                                                        script={script}
                                                        isActive={activeScriptId === script.id}
                                                        onClick={() => dispatch(setActiveScript(script.id))}
                                                        onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                        onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                        onDelete={() => handleDeleteScriptRequest(script)}
                                                    />
                                                ))}
                                            </DroppableCollection>
                                        ))}
                                    </>
                                )}
                                {projects.map(project => {
                                    const projectCollections = savedCollections.filter(c => c.project_id === project.id);
                                    const isExpanded = !!expandedProjects[project.id];
                                    const envLabels: Record<string, string> = {
                                        development: 'DEV',
                                        qa: 'QA',
                                        uat: 'UAT',
                                        production: 'PROD',
                                    };
                                    return (
                                        <DroppableProject
                                            key={project.id}
                                            project={project}
                                            isExpanded={isExpanded}
                                            toggleProject={() => toggleProject(project.id)}
                                            handleCreateScript={() => handleCreateScript()}
                                            handleCreateCollection={() => { setParentProjectId(project.id); setIsCreatingCollection(true); }}
                                            handleDeleteProject={() => handleDeleteProject(project.id)}
                                        >
                                            <div className="space-y-0.5">
                                                {projectCollections.map(collection => (
                                                    <DroppableCollection
                                                        key={collection.id}
                                                        collection={collection}
                                                        isExpanded={!!expandedCollections[collection.id]}
                                                        toggle={() => toggleCollection(collection.id)}
                                                        onDelete={() => handleDeleteCollection(collection.id)}
                                                        onCreateScript={() => handleCreateScript(collection.id)}
                                                    >
                                                        {grouped.result[collection.id]?.length === 0 && (
                                                            <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>
                                                        )}
                                                        {(grouped.result[collection.id] ?? []).map(script => (
                                                            <DraggableScript
                                                                key={script.id}
                                                                script={script}
                                                                isActive={activeScriptId === script.id}
                                                                onClick={() => dispatch(setActiveScript(script.id))}
                                                                onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                                onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                                onDelete={() => handleDeleteScriptRequest(script)}
                                                            />
                                                        ))}
                                                    </DroppableCollection>
                                                ))}
                                                {projectCollections.length === 0 && (
                                                    <div className="px-4 py-1 text-xs text-slate-400 italic">No collections</div>
                                                )}
                                            </div>
                                        </DroppableProject>
                                    );
                                })}

                                {/* Unassigned collections in Ops Mode */}
                                {(() => {
                                    const unassigned = savedCollections.filter(c => !c.project_id);
                                    if (unassigned.length === 0 && grouped.unsorted.length === 0) return null;
                                    return (
                                        <div className="space-y-0.5 mt-2">
                                            {(unassigned.length > 0 || grouped.unsorted.length > 0) && (
                                                <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                                    <Folder className="h-3 w-3" /> Unassigned
                                                </div>
                                            )}
                                            {unassigned.map(collection => (
                                                <DroppableCollection
                                                    key={collection.id}
                                                    collection={collection}
                                                    isExpanded={!!expandedCollections[collection.id]}
                                                    toggle={() => toggleCollection(collection.id)}
                                                    onDelete={() => handleDeleteCollection(collection.id)}
                                                    onCreateScript={() => handleCreateScript(collection.id)}
                                                >
                                                    {grouped.result[collection.id]?.length === 0 && (
                                                        <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>
                                                    )}
                                                    {(grouped.result[collection.id] ?? []).map(script => (
                                                        <DraggableScript
                                                            key={script.id}
                                                            script={script}
                                                            isActive={activeScriptId === script.id}
                                                            onClick={() => dispatch(setActiveScript(script.id))}
                                                            onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                            onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                            onDelete={() => handleDeleteScriptRequest(script)}
                                                        />
                                                    ))}
                                                </DroppableCollection>
                                            ))}
                                            {grouped.unsorted.map(script => (
                                                <DraggableScript
                                                    key={script.id}
                                                    script={script}
                                                    isActive={activeScriptId === script.id}
                                                    onClick={() => dispatch(setActiveScript(script.id))}
                                                    onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                    onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                    onDelete={() => handleDeleteScriptRequest(script)}
                                                />
                                            ))}
                                        </div>
                                    );
                                })()}
                            </>
                        )}

                        {/* === Normal Mode (or search active): flat collection → script view === */}
                        {(!isModeActive || searchQuery.trim()) && (
                            <>
                                {temporaryCollections.length > 0 && (
                                    <div className="px-2 py-2 text-xs font-semibold text-amber-500 uppercase">Temporary</div>
                                )}
                                {temporaryCollections.map(collection => (
                                    <DroppableCollection
                                        key={collection.id}
                                        collection={collection}
                                        isExpanded={!!expandedCollections[collection.id]}
                                        toggle={() => toggleCollection(collection.id)}
                                        onDelete={() => handleRemoveTemporaryCollection(collection)}
                                        onCreateScript={() => handleCreateScript(collection.id)}
                                        onConvertToCollection={() => openConvertCollectionDialog(collection)}
                                    >
                                        {grouped.result[collection.id].length === 0 && !searchQuery.trim() && (
                                            <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>
                                        )}
                                        {grouped.result[collection.id].map(script => (
                                            <DraggableScript
                                                key={script.id}
                                                script={script}
                                                isActive={activeScriptId === script.id}
                                                onClick={() => dispatch(setActiveScript(script.id))}
                                                onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                onDelete={() => handleDeleteScriptRequest(script)}
                                            />
                                        ))}
                                    </DroppableCollection>
                                ))}

                                {savedCollections.filter(c => searchQuery.trim() || !c.project_id).length > 0 && (
                                    <div className="px-2 py-2 text-xs font-semibold text-slate-400 uppercase">
                                        {temporaryCollections.length > 0 ? 'Collections' : ''}
                                    </div>
                                )}
                                {(searchQuery.trim() ? savedCollections : savedCollections.filter(c => !c.project_id)).map(collection => (
                                    <DroppableCollection
                                        key={collection.id}
                                        collection={collection}
                                        isExpanded={!!expandedCollections[collection.id]}
                                        toggle={() => toggleCollection(collection.id)}
                                        onDelete={() => handleDeleteCollection(collection.id)}
                                        onCreateScript={() => handleCreateScript(collection.id)}
                                        onConvertToCollection={collection.is_temporary ? () => openConvertCollectionDialog(collection) : undefined}
                                    >
                                        {grouped.result[collection.id].length === 0 && !searchQuery.trim() && (
                                            <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>
                                        )}
                                        {grouped.result[collection.id].map(script => (
                                            <DraggableScript
                                                key={script.id}
                                                script={script}
                                                isActive={activeScriptId === script.id}
                                                onClick={() => dispatch(setActiveScript(script.id))}
                                                onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                onDuplicate={() => dispatch(duplicateScript(script.id))}
                                                onDelete={() => handleDeleteScriptRequest(script)}
                                            />
                                        ))}
                                    </DroppableCollection>
                                ))}

                                {grouped.unsorted.length > 0 && (!isModeActive || searchQuery.trim()) && (
                                    <div className="px-2 py-2 text-xs font-semibold text-slate-400 uppercase">Unsorted</div>
                                )}
                                {grouped.unsorted.map((script) => (
                                    <DraggableScript
                                        key={script.id}
                                        script={script}
                                        isActive={activeScriptId === script.id}
                                        onClick={() => dispatch(setActiveScript(script.id))}
                                        onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                        onDuplicate={() => dispatch(duplicateScript(script.id))}
                                        onDelete={() => handleDeleteScriptRequest(script)}
                                    />
                                ))}
                            </>
                        )}
                    </div>

                    <div className="p-2 border-t bg-slate-50 dark:bg-slate-900 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center">
                        <span>
                            Gist Sync: <GistSyncStatus />
                        </span>
                    </div>
                </div >
                {
                    typeof window !== 'undefined' && createPortal(
                        <DragOverlay>
                            {activeDragScript && (
                                <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md bg-white border border-slate-200 shadow-lg opacity-80 w-64">
                                    <FileCode className="h-3.5 w-3.5" />
                                    <span className="truncate text-xs">{activeDragScript.name}</span>
                                </div>
                            )}
                            {activeDragCollection && (
                                <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md bg-white border border-slate-200 shadow-lg opacity-80 w-64">
                                    <Folder className="h-3.5 w-3.5 text-blue-500" />
                                    <span className="truncate text-xs font-semibold">{activeDragCollection.name}</span>
                                </div>
                            )}
                        </DragOverlay>,
                        document.body
                    )
                }

                {/* Create new script dialog */}
                <Dialog open={isCreateScriptOpen} onOpenChange={(open) => !isCreatingScript && setIsCreateScriptOpen(open)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Create New Script</DialogTitle>
                            <DialogDescription>
                                {parentCollectionId && collections.find((collection) => collection.id === parentCollectionId)?.folder_path
                                    ? 'Enter details for your new script. It will be created inside the linked folder for this collection.'
                                    : 'Enter details for your new script. It will be saved to your local scripts folder.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 py-4">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="name" className="text-left">
                                    Script Name
                                </Label>
                                <Input
                                    id="name"
                                    placeholder="myscript.py"
                                    value={newScriptName}
                                    onChange={(e) => setNewScriptName(e.target.value)}
                                    autoFocus
                                    disabled={isCreatingScript}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateScriptSubmit()}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="description" className="text-left">
                                    Description <span className="text-slate-400 font-normal">(optional)</span>
                                </Label>
                                <Input
                                    id="description"
                                    placeholder="What does this script do?"
                                    value={newScriptDescription}
                                    onChange={(e) => setNewScriptDescription(e.target.value)}
                                    disabled={isCreatingScript}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateScriptSubmit()}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="syncToGist"
                                    checked={syncToGistOverride}
                                    onCheckedChange={(checked) => setSyncToGistOverride(!!checked)}
                                    disabled={isCreatingScript}
                                />
                                <label
                                    htmlFor="syncToGist"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Sync to GitHub Gist
                                </label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsCreateScriptOpen(false)} disabled={isCreatingScript}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateScriptSubmit} disabled={!newScriptName.trim() || isCreatingScript}>
                                {isCreatingScript ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create Script'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={isOpenFolderDialogOpen} onOpenChange={(open) => !isOpeningFolder && setIsOpenFolderDialogOpen(open)}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4 text-blue-500" />
                                Open Local Folder
                            </DialogTitle>
                            <DialogDescription>
                                {window.scriptManagerDesktop?.selectFolder
                                    ? 'Link a local folder into ScriptManager. You can open it as a temporary workspace or save it as a reusable collection.'
                                    : 'Import a local folder into ScriptManager using the browser picker. You can open it as a temporary workspace or save it as a collection copy.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 py-2">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="folder-path">Folder Path</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="folder-path"
                                        value={folderPath}
                                        onChange={(e) => setFolderPath(e.target.value)}
                                        placeholder="Select a local folder"
                                        disabled={isOpeningFolder || !window.scriptManagerDesktop?.selectFolder}
                                    />
                                    <Button type="button" variant="outline" onClick={selectFolderPath} disabled={isOpeningFolder}>
                                        Browse
                                    </Button>
                                </div>
                                {!window.scriptManagerDesktop?.selectFolder && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        The browser will open a real folder picker and import supported script files from the selected folder.
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label>Open Mode</Label>
                                <Select value={folderMode} onValueChange={(value: 'temporary' | 'collection') => setFolderMode(value)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="temporary">Temporary workspace</SelectItem>
                                        <SelectItem value="collection">Save as collection</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {folderMode === 'temporary'
                                        ? 'Good for a quick browse or one-off editing session.'
                                        : 'Keeps this folder linked in the database as a collection for later use.'}
                                </p>
                            </div>

                            {folderMode === 'collection' && (
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="folder-collection-name">Collection Name</Label>
                                    <Input
                                        id="folder-collection-name"
                                        value={folderCollectionName}
                                        onChange={(e) => setFolderCollectionName(e.target.value)}
                                        placeholder="Collection name"
                                        disabled={isOpeningFolder}
                                    />
                                </div>
                            )}

                            {openFolderError && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                                    {openFolderError}
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setIsOpenFolderDialogOpen(false)} disabled={isOpeningFolder}>
                                Cancel
                            </Button>
                            <Button onClick={handleOpenFolderSubmit} disabled={!folderPath.trim() || isOpeningFolder}>
                                {isOpeningFolder ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Opening...
                                    </>
                                ) : (
                                    'Open Folder'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <Dialog open={!!collectionToConvert} onOpenChange={(open) => !open && setCollectionToConvert(null)}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Save Temporary Workspace</DialogTitle>
                            <DialogDescription>
                                Convert this temporary folder workspace into a saved collection.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-3">
                            <Label htmlFor="convert-collection-name" className="text-sm">Collection Name</Label>
                            <Input
                                id="convert-collection-name"
                                className="mt-2"
                                value={convertCollectionName}
                                onChange={(e) => setConvertCollectionName(e.target.value)}
                                disabled={isConvertingCollection}
                                autoFocus
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" onClick={() => setCollectionToConvert(null)} disabled={isConvertingCollection}>
                                Cancel
                            </Button>
                            <Button onClick={handleConvertTemporaryCollection} disabled={!convertCollectionName.trim() || isConvertingCollection}>
                                {isConvertingCollection ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save as Collection'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <input
                    ref={filePickerRef}
                    type="file"
                    className="hidden"
                    multiple
                    // @ts-expect-error Chromium directory picker attribute
                    webkitdirectory=""
                    onChange={handleFolderInputChange}
                />

                {/* Save as Template dialog */}
                <Dialog open={isSaveAsTemplateOpen} onOpenChange={setIsSaveAsTemplateOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <LayoutTemplate className="h-4 w-4 text-blue-500" />
                                Save as Template
                            </DialogTitle>
                            <DialogDescription>
                                Save &quot;{saveAsSourceScript?.name}&quot; as a reusable template.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 py-2">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="tpl-name" className="text-xs">Template Name</Label>
                                <Input
                                    id="tpl-name"
                                    placeholder="My Template"
                                    value={saveAsTemplateName}
                                    onChange={(e) => {
                                        setSaveAsTemplateName(e.target.value)
                                        if (saveAsError) setSaveAsError('')
                                    }}
                                    autoFocus
                                    className="h-8 text-xs"
                                />
                                {saveAsError && (
                                    <p className="text-[10px] text-red-500">{saveAsError}</p>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="tpl-desc" className="text-xs">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                                <Input
                                    id="tpl-desc"
                                    placeholder="What does this template do?"
                                    value={saveAsDescription}
                                    onChange={(e) => setSaveAsDescription(e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="tpl-category" className="text-xs">Category</Label>
                                <Select value={saveAsCategory} onValueChange={setSaveAsCategory}>
                                    <SelectTrigger id="tpl-category" className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="general">general</SelectItem>
                                        <SelectItem value="networking">networking</SelectItem>
                                        <SelectItem value="filesystem">filesystem</SelectItem>
                                        <SelectItem value="system">system</SelectItem>
                                        <SelectItem value="data">data</SelectItem>
                                        <SelectItem value="automation">automation</SelectItem>
                                        <SelectItem value="other">other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="text-xs"
                                onClick={() => setIsSaveAsTemplateOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                className="text-xs"
                                onClick={handleSaveAsTemplate}
                                disabled={!saveAsTemplateName.trim() || saveAsLoading}
                            >
                                {saveAsLoading ? 'Saving…' : 'Save Template'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Script Confirmation Dialog */}
                <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                                <Trash2 className="h-5 w-5" />
                                Delete Script
                            </DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete <span className="font-semibold text-slate-900 dark:text-slate-100">{scriptToDelete?.name}</span>? This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>

                        {scriptToDelete?.gist_id && (
                            <div className="flex items-center space-x-2 py-2">
                                <Checkbox
                                    id="deleteFromGist"
                                    checked={deleteFromGist}
                                    onCheckedChange={(checked) => setDeleteFromGist(!!checked)}
                                />
                                <Label
                                    htmlFor="deleteFromGist"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Also delete from GitHub Gist
                                </Label>
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                variant="secondary"
                                onClick={() => setIsDeleteDialogOpen(false)}
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={confirmDeleteScript}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete Script'
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DndContext >
        </>
    );
};
