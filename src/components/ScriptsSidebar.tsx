'use client'

import { useState, useMemo, useEffect, useCallback, useDeferredValue, memo } from 'react';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import type { RootState } from '@/store/store';
import {
    setActiveScript, createScript, createCollection, deleteCollection, moveScript, moveCollection,
    saveAsTemplate, duplicateScript, deleteScript, openScriptsFolder, importScriptsFolder,
    removeTemporaryCollection, convertTemporaryCollection, fetchCollections,
} from '@/features/scripts/scriptsSlice';
import type { Script, Collection, ScriptTemplate } from '@/features/scripts/scriptsSlice';
import {
    selectScriptItems, selectCollections, selectActiveScriptId,
    selectTemplates, selectAllTags, selectScriptsStatus,
} from '@/features/scripts/selectors';
import { selectOpsProjects, selectIsModeActive } from '@/features/ops/selectors';
import { selectSettings } from '@/features/settings/selectors';
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
import { CreateScriptDialog } from './sidebar/CreateScriptDialog';
import { CreateCollectionDialog } from './sidebar/CreateCollectionDialog';
import { OpenFolderDialog, type OpenFolderSubmitValues } from './sidebar/OpenFolderDialog';
import { DeleteScriptDialog } from './sidebar/DeleteScriptDialog';
import { DeleteCollectionDialog } from './sidebar/DeleteCollectionDialog';
import { PythonEnvDialog } from './sidebar/PythonEnvDialog';
import { SaveAsTemplateDialog } from './sidebar/SaveAsTemplateDialog';
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

const GistSyncStatus = () => {
    const settings = useAppSelector(selectSettings);
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

// Draggable Script Component — memoized; only re-renders when script data or active state changes
const DraggableScript = memo(({
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
                    <div className="w-4 flex-shrink-0" />
                    <FileCode className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500")} />
                    <span className="truncate text-[13px] flex-1">{script.name}<UnsavedIndicator scriptId={script.id} /></span>
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" />
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
// Only re-render when script data or active state changes (ignore inline callback reference changes)
}, (prev, next) => prev.script === next.script && prev.isActive === next.isActive);

const CollectionScriptRows = memo(({
    scripts,
    activeScriptId,
    onActivateScript,
    onSaveAsTemplate,
    onDuplicateScript,
    onDeleteScript,
}: {
    scripts: Script[]
    activeScriptId: string | null
    onActivateScript: (scriptId: string) => void
    onSaveAsTemplate: (script: Script) => void
    onDuplicateScript: (scriptId: string) => void
    onDeleteScript: (script: Script) => void
}) => {
    if (scripts.length === 0) {
        return <div className="px-2 py-1 text-xs text-slate-400 italic">Empty</div>;
    }

    return (
        <>
            {scripts.map((script) => (
                <DraggableScript
                    key={script.id}
                    script={script}
                    isActive={activeScriptId === script.id}
                    onClick={() => onActivateScript(script.id)}
                    onSaveAsTemplate={() => onSaveAsTemplate(script)}
                    onDuplicate={() => onDuplicateScript(script.id)}
                    onDelete={() => onDeleteScript(script)}
                />
            ))}
        </>
    );
}, (prev, next) =>
    prev.scripts === next.scripts &&
    prev.activeScriptId === next.activeScriptId
);

const getCollectionTreeKey = (parentId: string | null, projectId: string | null) =>
    `${projectId ?? '__root_project__'}::${parentId ?? '__root_parent__'}`;

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

// Droppable Collection Component — memoized; only re-renders when collection data or expand state changes
const DroppableCollection = memo(({
    collection,
    isExpanded,
    toggle,
    scripts,
    activeScriptId,
    isDeleting,
    onDelete,
    onCreateScript,
    onActivateScript,
    onSaveAsTemplate,
    onDuplicateScript,
    onDeleteScript,
    onConvertToCollection,
    onManagePythonEnv,
    subCollectionsNode,
    onCreateSubCollection,
}: {
    collection: Collection,
    isExpanded: boolean,
    toggle: () => void,
    scripts: Script[],
    activeScriptId: string | null,
    isDeleting?: boolean,
    onDelete: () => void,
    onCreateScript: () => void
    onActivateScript: (scriptId: string) => void
    onSaveAsTemplate: (script: Script) => void
    onDuplicateScript: (scriptId: string) => void
    onDeleteScript: (script: Script) => void
    onConvertToCollection?: () => void
    onManagePythonEnv?: () => void
    subCollectionsNode?: React.ReactNode
    onCreateSubCollection: () => void
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
            <div ref={setDroppableNodeRef} className={cn("space-y-0.5 rounded-md transition-colors", isOver && "bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-200 dark:ring-blue-800")}>
                <ContextMenuTrigger asChild>
                    <div
                        ref={setDraggableNodeRef}
                        className={cn("flex items-center gap-1 px-1.5 py-1.5 text-sm font-medium rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-800 group cursor-pointer", isDragging && "opacity-50 line-through")}
                        onClick={toggle}
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
                                    onClick={(e) => { e.stopPropagation(); onCreateScript(); }}
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
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateScript(); }}>
                                            <Plus className="mr-2 h-4 w-4" /> New Script
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateSubCollection(); }}>
                                            <Folder className="mr-2 h-4 w-4" /> New Sub-collection
                                        </DropdownMenuItem>
                                        {collection.is_temporary && onConvertToCollection && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvertToCollection(); }}>
                                                <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                                            </DropdownMenuItem>
                                        )}
                                        {onManagePythonEnv && (
                                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onManagePythonEnv(); }}>
                                                <Folder className="mr-2 h-4 w-4" /> Python Environment...
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                                            <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete'}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </ContextMenuTrigger>
                {isExpanded && (
                    <div className="ml-3.5 mt-0.5 space-y-0.5 border-l-[1.5px] border-slate-100 pl-2.5 dark:border-slate-800/80">
                        {subCollectionsNode}
                        <CollectionScriptRows
                            scripts={scripts}
                            activeScriptId={activeScriptId}
                            onActivateScript={onActivateScript}
                            onSaveAsTemplate={onSaveAsTemplate}
                            onDuplicateScript={onDuplicateScript}
                            onDeleteScript={onDeleteScript}
                        />
                    </div>
                )}
            </div>
            <ContextMenuContent>
                <ContextMenuItem onClick={onCreateScript}>
                    <Plus className="mr-2 h-4 w-4" /> New Script here
                </ContextMenuItem>
                <ContextMenuItem onClick={onCreateSubCollection}>
                    <Folder className="mr-2 h-4 w-4" /> New Sub-collection here
                </ContextMenuItem>
                {collection.is_temporary && onConvertToCollection && (
                    <ContextMenuItem onClick={onConvertToCollection}>
                        <FolderOpen className="mr-2 h-4 w-4" /> Save as Collection
                    </ContextMenuItem>
                )}
                {onManagePythonEnv && (
                    <ContextMenuItem onClick={onManagePythonEnv}>
                        <Folder className="mr-2 h-4 w-4" /> Python Environment...
                    </ContextMenuItem>
                )}
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> {collection.is_temporary ? 'Remove Workspace' : 'Delete Collection'}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
// Only re-render when collection data, expand state, or children change
}, (prev, next) =>
    prev.collection === next.collection &&
    prev.isExpanded === next.isExpanded &&
    prev.scripts === next.scripts &&
    prev.activeScriptId === next.activeScriptId &&
    prev.isDeleting === next.isDeleting &&
    prev.subCollectionsNode === next.subCollectionsNode
);

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
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 group cursor-pointer"
                onClick={toggleProject}
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
                <div className="ml-[18px] pl-2 mt-0.5 border-l-[1.5px] border-slate-100 dark:border-slate-800/80 space-y-0.5 relative">
                    {children}
                </div>
            )}
        </div>
    );
};

const ScriptsSidebarComponent = () => {
    const dispatch = useAppDispatch();
    const store = useAppStore();
    // Narrow per-field subscriptions — avoids re-rendering the whole sidebar on
    // unrelated slice updates (e.g. appendBuildOutput firing per output chunk)
    const scripts = useAppSelector(selectScriptItems);
    const collections = useAppSelector(selectCollections);
    const activeScriptId = useAppSelector(selectActiveScriptId);
    const templates = useAppSelector(selectTemplates);
    const allTags = useAppSelector(selectAllTags);
    const status = useAppSelector(selectScriptsStatus);
    const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);
    const [pendingCollectionDeleteId, setPendingCollectionDeleteId] = useState<string | null>(null);
    const [parentProjectId, setParentProjectId] = useState<string | null>(null);
    const [parentCreationCollectionId, setParentCreationCollectionId] = useState<string | null>(null);
    const [activeDragScript, setActiveDragScript] = useState<Script | null>(null);
    const [activeDragCollection, setActiveDragCollection] = useState<Collection | null>(null);

    // New Script Dialog State
    const [isCreateScriptOpen, setIsCreateScriptOpen] = useState(false);
    const [isCreatingScript, setIsCreatingScript] = useState(false);
    const [parentCollectionId, setParentCollectionId] = useState<string | null>(null);
    const [isOpenFolderDialogOpen, setIsOpenFolderDialogOpen] = useState(false);
    const [isOpeningFolder, setIsOpeningFolder] = useState(false);
    const [collectionToConvert, setCollectionToConvert] = useState<Collection | null>(null);
    const [convertCollectionName, setConvertCollectionName] = useState('');
    const [isConvertingCollection, setIsConvertingCollection] = useState(false);
    const [hasDesktopFolderPicker, setHasDesktopFolderPicker] = useState(false);
    const [pythonEnvCollection, setPythonEnvCollection] = useState<Collection | null>(null);
    const [isPythonEnvLoading, setIsPythonEnvLoading] = useState(false);

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
    const [saveAsLoading, setSaveAsLoading] = useState(false);

    // Delete confirmation dialog state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [scriptToDelete, setScriptToDelete] = useState<Script | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
    const [isDeletingCollectionDialog, setIsDeletingCollectionDialog] = useState(false);

    const settings = useAppSelector(selectSettings);
    const isModeActive = useAppSelector(selectIsModeActive);
    const projects = useAppSelector(selectOpsProjects);
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
        setHasDesktopFolderPicker(Boolean(window.scriptManagerDesktop?.selectFolder));

        const openFolderFromDesktopMenu = () => {
            openFolderDialog();
        };

        window.addEventListener('scriptmanager:desktop-open-folder', openFolderFromDesktopMenu as EventListener);
        return () => {
            window.removeEventListener('scriptmanager:desktop-open-folder', openFolderFromDesktopMenu as EventListener);
        };
    }, []);

    // Initial data fetching is centralized in page.tsx

    const toggleCollection = (id: string) => {
        setExpandedCollections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleActivateScript = useCallback((scriptId: string) => {
        dispatch(setActiveScript(scriptId));
    }, [dispatch]);

    const handleDuplicateScript = useCallback((scriptId: string) => {
        dispatch(duplicateScript(scriptId));
    }, [dispatch]);

    const handleDeleteScriptRequest = useCallback((script: Script) => {
        setScriptToDelete(script);
        setIsDeleteDialogOpen(true);
    }, []);

    const confirmDeleteScript = async ({ deleteFromGist }: { deleteFromGist: boolean }) => {
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

    const openCreateCollectionDialog = (projectId?: string | null, parentId?: string | null) => {
        setParentProjectId(projectId ?? null);
        setParentCreationCollectionId(parentId ?? null);
        setIsCreatingCollection(true);
    };

    const resetCollectionCreationState = () => {
        setParentProjectId(null);
        setParentCreationCollectionId(null);
        setIsCreatingCollection(false);
    };

    const openFolderDialog = () => {
        setIsOpenFolderDialogOpen(true);
    };

    const inferScriptDraft = useCallback((rawName: string, collectionId?: string | null) => {
        const collection = collectionId ? collections.find((entry) => entry.id === collectionId) : null;
        const runtimePreset = collection?.runtime_preset ?? 'general';
        let finalName = rawName.trim();
        let language = 'python';
        let content = 'print("Hello World")';

        const lowerName = finalName.toLowerCase();
        const hasExtension = /\.[a-z0-9]+$/i.test(finalName);

        if (lowerName.endsWith('.py')) {
            language = 'python';
            content = 'print("Hello World")';
        } else if (lowerName.endsWith('.js') || lowerName.endsWith('.ts')) {
            language = 'node';
            content = 'console.log("Hello World");';
        } else if (lowerName.endsWith('.ps1')) {
            language = 'powershell';
            content = 'Write-Host "Hello World"';
        } else if (lowerName.endsWith('.sh')) {
            language = 'shell';
            content = '#!/bin/bash\necho "Hello World"';
        } else if (!hasExtension) {
            if (runtimePreset === 'node') {
                finalName += '.js';
                language = 'node';
                content = 'console.log("Hello World");';
            } else if (runtimePreset === 'shell') {
                finalName += '.sh';
                language = 'shell';
                content = '#!/bin/bash\necho "Hello World"';
            } else if (runtimePreset === 'powershell') {
                finalName += '.ps1';
                language = 'powershell';
                content = 'Write-Host "Hello World"';
            } else {
                finalName += '.py';
                language = 'python';
                content = 'print("Hello World")';
            }
        }

        return { finalName, language, content };
    }, [collections]);

    const openPythonEnvironmentDialog = useCallback((collection: Collection) => {
        setPythonEnvCollection(collection);
    }, []);

    const handlePythonEnvChanged = useCallback(async () => {
        await dispatch(fetchCollections());
    }, [dispatch]);

    const handleOpenFolderSubmit = async (values: OpenFolderSubmitValues): Promise<string | null> => {
        if (isOpeningFolder) return null;

        setIsOpeningFolder(true);
        try {
            const result = hasDesktopFolderPicker
                ? await dispatch(openScriptsFolder({
                    folderPath: values.folderPath,
                    mode: values.mode,
                    collectionName: values.collectionName,
                    runtimePreset: values.runtimePreset,
                    pythonToolchainEnabled: values.pythonToolchainEnabled,
                    createVenvIfMissing: values.createVenvIfMissing,
                }))
                : await dispatch(importScriptsFolder({
                    mode: values.mode,
                    folderName: values.folderPath,
                    collectionName: values.collectionName,
                    files: values.files,
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
                return null;
            }

            return typeof result.payload === 'string'
                ? result.payload
                : (result.error?.message || 'Failed to open folder');
        } finally {
            setIsOpeningFolder(false);
        }
    };

    const handleCreateScriptSubmit = async (values: { name: string; description: string; collectionId: string | null; syncToGist: boolean }) => {
        if (!values.name.trim() || isCreatingScript) return;

        setIsCreatingScript(true);
        try {
            const { finalName, content, language } = inferScriptDraft(values.name, values.collectionId);

            const result = await dispatch(createScript({
                name: finalName,
                description: values.description.trim() || undefined,
                syncToGist: values.syncToGist,
                content,
                language,
                collectionId: values.collectionId,
            }));

            if (createScript.fulfilled.match(result)) {
                if (values.collectionId) {
                    const createdInCollectionId = values.collectionId;
                    setExpandedCollections(prev => ({ ...prev, [createdInCollectionId]: true }));
                }
                setIsCreateScriptOpen(false);
            }
        } finally {
            setIsCreatingScript(false);
        }
    };

    const handleCreateScript = async (collectionId?: string) => {
        openCreateScriptDialog(collectionId);
    };

    const handleCreateCollection = async (values: { name: string; runtimePreset: NonNullable<Collection['runtime_preset']>; pythonTools: boolean }) => {
        if (!values.name.trim() || isSubmittingCollection) return;
        setIsSubmittingCollection(true);
        try {
            const createdCollection = await dispatch(createCollection({
                name: values.name.trim(),
                projectId: parentProjectId,
                parentId: parentCreationCollectionId,
                runtimePreset: values.runtimePreset,
                pythonToolchainEnabled: values.runtimePreset === 'python' ? true : values.pythonTools,
            })).unwrap();
            if (parentCreationCollectionId) {
                setExpandedCollections(prev => ({ ...prev, [parentCreationCollectionId]: true }));
            }
            if (createdCollection.project_id) {
                setExpandedProjects(prev => ({ ...prev, [createdCollection.project_id!]: true }));
            }
            resetCollectionCreationState();
        } finally {
            setIsSubmittingCollection(false);
        }
    };

    const handleDeleteCollection = async (collection: Collection) => {
        setCollectionToDelete(collection);
    };

    const handleRemoveTemporaryCollection = async (collection: Collection) => {
        setCollectionToDelete(collection);
    };

    const confirmDeleteCollection = async () => {
        if (!collectionToDelete || isDeletingCollectionDialog) {
            return;
        }

        setIsDeletingCollectionDialog(true);
        setPendingCollectionDeleteId(collectionToDelete.id);
        try {
            if (collectionToDelete.is_temporary) {
                await dispatch(removeTemporaryCollection(collectionToDelete.id)).unwrap();
            } else {
                await dispatch(deleteCollection(collectionToDelete.id)).unwrap();
            }
            setCollectionToDelete(null);
        } finally {
            setPendingCollectionDeleteId((current) => current === collectionToDelete.id ? null : current);
            setIsDeletingCollectionDialog(false);
        }
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
        } else if (activeData?.type === 'collection' && overData?.type === 'collection') {
            const collectionId = activeData.collection.id;
            const parentId = overData.collection.id;
            if (activeData.collection.parent_id !== parentId && activeData.collection.id !== parentId) {
                await dispatch(moveCollection({ collectionId, parentId, projectId: overData.collection.project_id }));
                setExpandedCollections(prev => ({ ...prev, [parentId]: true }));
            }
        } else if (activeData?.type === 'collection' && overData?.type === 'project') {
            const collectionId = activeData.collection.id;
            const projectId = overData.project.id;
            if (activeData.collection.project_id !== projectId || activeData.collection.parent_id !== null) {
                await dispatch(moveCollection({ collectionId, projectId, parentId: null }));
                setExpandedProjects(prev => ({ ...prev, [projectId]: true }));
            }
        }
    };

    // --- Template handlers ---

    const openSaveAsTemplate = useCallback((script: Script) => {
        setSaveAsSourceScript(script);
        setSaveAsLoading(false);
        setIsSaveAsTemplateOpen(true);
    }, []);

    const handleSaveAsTemplate = async (values: { name: string; description: string; category: string }): Promise<string | null> => {
        if (!saveAsSourceScript || !values.name.trim()) return null;
        setSaveAsLoading(true);

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
                name: values.name.trim(),
                description: values.description.trim(),
                category: values.category,
                language: saveAsSourceScript.language ?? 'python',
                interpreter: saveAsSourceScript.interpreter ?? null,
                content,
                parameters: saveAsSourceScript.parameters,
            }))

            if (saveAsTemplate.fulfilled.match(result)) {
                setIsSaveAsTemplateOpen(false)
                return null
            }
            if (saveAsTemplate.rejected.match(result)) {
                const payload = result.payload as { error?: string } | undefined
                return payload?.error ?? 'Failed to save template'
            }
            return null
        } catch {
            return 'Failed to save template'
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

    const savedCollectionsByTreeKey = useMemo(() => {
        const map: Record<string, Collection[]> = {};

        for (const collection of savedCollections) {
            const key = getCollectionTreeKey(collection.parent_id ?? null, collection.project_id ?? null);
            map[key] ??= [];
            map[key].push(collection);
        }

        return map;
    }, [savedCollections]);

    const projectCollectionCounts = useMemo(() => {
        const counts: Record<string, number> = {};

        for (const collection of savedCollections) {
            if (!collection.project_id) continue;
            counts[collection.project_id] = (counts[collection.project_id] ?? 0) + 1;
        }

        return counts;
    }, [savedCollections]);

    const rootSavedCollections = useMemo(
        () => savedCollectionsByTreeKey[getCollectionTreeKey(null, null)] ?? [],
        [savedCollectionsByTreeKey]
    );

    const hasCollectionFolder = Boolean(collectionToDelete?.folder_path && !collectionToDelete?.is_temporary);
    const sidebarBusyText = useMemo(() => {
        if (isSubmittingCollection) return 'Creating collection...';
        if (isCreatingScript) return 'Creating script...';
        if (isOpeningFolder) return 'Opening folder...';
        if (isConvertingCollection) return 'Saving workspace as collection...';
        if (isPythonEnvLoading) return 'Preparing Python environment...';
        if (saveAsLoading) return 'Saving template...';
        if (isDeletingCollectionDialog) return hasCollectionFolder ? 'Removing local workspace...' : 'Deleting collection...';
        if (pendingCollectionDeleteId) return 'Removing collection...';
        if (isDeleting) return 'Deleting script...';
        if (isCreatingProject) return 'Creating project...';
        return null;
    }, [
        hasCollectionFolder,
        isConvertingCollection,
        isCreatingProject,
        isCreatingScript,
        isDeleting,
        isDeletingCollectionDialog,
        isOpeningFolder,
        isPythonEnvLoading,
        isSubmittingCollection,
        pendingCollectionDeleteId,
        saveAsLoading,
    ]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const renderCollectionTree = (parentId: string | null = null, currentProjectId: string | null = null): React.ReactNode => {
        const children = savedCollectionsByTreeKey[getCollectionTreeKey(parentId, currentProjectId)] ?? [];
        if (children.length === 0) return null;

        return (
            <div className="space-y-0.5">
                {children.map((collection) => (
                    <DroppableCollection
                        key={collection.id}
                        collection={collection}
                        isExpanded={!!expandedCollections[collection.id]}
                        isDeleting={pendingCollectionDeleteId === collection.id}
                        toggle={() => toggleCollection(collection.id)}
                        scripts={grouped.result[collection.id] ?? []}
                        activeScriptId={activeScriptId}
                        onDelete={() => handleDeleteCollection(collection)}
                        onCreateScript={() => handleCreateScript(collection.id)}
                        onCreateSubCollection={() => openCreateCollectionDialog(collection.project_id, collection.id)}
                        onActivateScript={handleActivateScript}
                        onSaveAsTemplate={openSaveAsTemplate}
                        onDuplicateScript={handleDuplicateScript}
                        onDeleteScript={handleDeleteScriptRequest}
                        onManagePythonEnv={hasDesktopFolderPicker && collection.folder_path ? () => openPythonEnvironmentDialog(collection) : undefined}
                        subCollectionsNode={renderCollectionTree(collection.id, currentProjectId)}
                    />
                ))}
            </div>
        );
    };

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
                                        <DropdownMenuItem onClick={() => openCreateCollectionDialog(null)}>
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

                        {sidebarBusyText && (
                            <div className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                                <span>{sidebarBusyText}</span>
                            </div>
                        )}

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

                    <CreateCollectionDialog
                        key={`${parentProjectId ?? ''}:${parentCreationCollectionId ?? ''}`}
                        open={isCreatingCollection}
                        hasDesktopFolderPicker={hasDesktopFolderPicker}
                        submitting={isSubmittingCollection}
                        onCancel={resetCollectionCreationState}
                        onCreate={handleCreateCollection}
                    />

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
                                                isDeleting={pendingCollectionDeleteId === collection.id}
                                                toggle={() => toggleCollection(collection.id)}
                                                scripts={grouped.result[collection.id] ?? []}
                                                activeScriptId={activeScriptId}
                                                onDelete={() => handleRemoveTemporaryCollection(collection)}
                                                onCreateScript={() => handleCreateScript(collection.id)}
                                                onCreateSubCollection={() => openCreateCollectionDialog(collection.project_id, collection.id)}
                                                onActivateScript={handleActivateScript}
                                                onSaveAsTemplate={openSaveAsTemplate}
                                                onDuplicateScript={handleDuplicateScript}
                                                onDeleteScript={handleDeleteScriptRequest}
                                                onConvertToCollection={() => openConvertCollectionDialog(collection)}
                                                onManagePythonEnv={hasDesktopFolderPicker && collection.folder_path ? () => openPythonEnvironmentDialog(collection) : undefined}
                                            />
                                        ))}
                                    </>
                                )}
                                {projects.map(project => {
                                    const isExpanded = !!expandedProjects[project.id];
                                    return (
                                        <DroppableProject
                                            key={project.id}
                                            project={project}
                                            isExpanded={isExpanded}
                                            toggleProject={() => toggleProject(project.id)}
                                            handleCreateScript={() => handleCreateScript()}
                                            handleCreateCollection={() => openCreateCollectionDialog(project.id)}
                                            handleDeleteProject={() => handleDeleteProject(project.id)}
                                        >
                                            <div className="space-y-0.5">
                                                {renderCollectionTree(null, project.id)}
                                                {(projectCollectionCounts[project.id] ?? 0) === 0 && (
                                                    <div className="px-4 py-1 text-xs text-slate-400 italic">No collections</div>
                                                )}
                                            </div>
                                        </DroppableProject>
                                    );
                                })}

                                {/* Unassigned collections in Ops Mode */}
                                {(() => {
                                    if (rootSavedCollections.length === 0 && grouped.unsorted.length === 0) return null;
                                    return (
                                        <div className="space-y-0.5 mt-2">
                                            {(rootSavedCollections.length > 0 || grouped.unsorted.length > 0) && (
                                                <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mt-2 mb-1">
                                                    Unassigned
                                                </div>
                                            )}
                                            {renderCollectionTree(null, null)}
                                            {grouped.unsorted.map(script => (
                                                <DraggableScript
                                                    key={script.id}
                                                    script={script}
                                                    isActive={activeScriptId === script.id}
                                                    onClick={() => handleActivateScript(script.id)}
                                                    onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                                    onDuplicate={() => handleDuplicateScript(script.id)}
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
                                        isDeleting={pendingCollectionDeleteId === collection.id}
                                        toggle={() => toggleCollection(collection.id)}
                                        scripts={grouped.result[collection.id] ?? []}
                                        activeScriptId={activeScriptId}
                                        onDelete={() => handleRemoveTemporaryCollection(collection)}
                                        onCreateScript={() => handleCreateScript(collection.id)}
                                        onCreateSubCollection={() => openCreateCollectionDialog(collection.project_id, collection.id)}
                                        onActivateScript={handleActivateScript}
                                        onSaveAsTemplate={openSaveAsTemplate}
                                        onDuplicateScript={handleDuplicateScript}
                                        onDeleteScript={handleDeleteScriptRequest}
                                        onConvertToCollection={() => openConvertCollectionDialog(collection)}
                                        onManagePythonEnv={hasDesktopFolderPicker && collection.folder_path ? () => openPythonEnvironmentDialog(collection) : undefined}
                                    />
                                ))}

                                {(searchQuery.trim() ? savedCollections.length > 0 : rootSavedCollections.length > 0) && (
                                    <div className="px-2 py-2 text-xs font-semibold text-slate-400 uppercase">
                                        {temporaryCollections.length > 0 ? 'Collections' : ''}
                                    </div>
                                )}
                                {searchQuery.trim() ? savedCollections.map(collection => (
                                    <DroppableCollection
                                        key={collection.id}
                                        collection={collection}
                                        isExpanded={!!expandedCollections[collection.id]}
                                        isDeleting={pendingCollectionDeleteId === collection.id}
                                        toggle={() => toggleCollection(collection.id)}
                                        scripts={grouped.result[collection.id] ?? []}
                                        activeScriptId={activeScriptId}
                                        onDelete={() => handleDeleteCollection(collection)}
                                        onCreateScript={() => handleCreateScript(collection.id)}
                                        onCreateSubCollection={() => openCreateCollectionDialog(collection.project_id, collection.id)}
                                        onActivateScript={handleActivateScript}
                                        onSaveAsTemplate={openSaveAsTemplate}
                                        onDuplicateScript={handleDuplicateScript}
                                        onDeleteScript={handleDeleteScriptRequest}
                                        onConvertToCollection={collection.is_temporary ? () => openConvertCollectionDialog(collection) : undefined}
                                        onManagePythonEnv={hasDesktopFolderPicker && collection.folder_path ? () => openPythonEnvironmentDialog(collection) : undefined}
                                    />
                                )) : renderCollectionTree(null, null)}

                                {grouped.unsorted.length > 0 && (!isModeActive || searchQuery.trim()) && (
                                    <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-2 mb-1">Unsorted</div>
                                )}
                                {grouped.unsorted.map((script) => (
                                    <DraggableScript
                                        key={script.id}
                                        script={script}
                                        isActive={activeScriptId === script.id}
                                        onClick={() => handleActivateScript(script.id)}
                                        onSaveAsTemplate={() => openSaveAsTemplate(script)}
                                        onDuplicate={() => handleDuplicateScript(script.id)}
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
                <CreateScriptDialog
                    open={isCreateScriptOpen}
                    parentCollectionId={parentCollectionId}
                    parentHasFolderPath={Boolean(parentCollectionId && collections.find((collection) => collection.id === parentCollectionId)?.folder_path)}
                    defaultSyncToGist={settings['gist_sync_enabled'] === 'true'}
                    submitting={isCreatingScript}
                    onOpenChange={setIsCreateScriptOpen}
                    onCreate={handleCreateScriptSubmit}
                />

                <OpenFolderDialog
                    open={isOpenFolderDialogOpen}
                    hasDesktopFolderPicker={hasDesktopFolderPicker}
                    submitting={isOpeningFolder}
                    onOpenChange={setIsOpenFolderDialogOpen}
                    onSubmit={handleOpenFolderSubmit}
                />
                <PythonEnvDialog
                    collection={pythonEnvCollection}
                    loading={isPythonEnvLoading}
                    onLoadingChange={setIsPythonEnvLoading}
                    onOpenChange={(open) => !open && setPythonEnvCollection(null)}
                    onEnvChanged={handlePythonEnvChanged}
                />
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
                {/* Save as Template dialog */}
                <SaveAsTemplateDialog
                    open={isSaveAsTemplateOpen}
                    sourceScript={saveAsSourceScript}
                    submitting={saveAsLoading}
                    onOpenChange={setIsSaveAsTemplateOpen}
                    onSubmit={handleSaveAsTemplate}
                />

                <DeleteCollectionDialog
                    collection={collectionToDelete}
                    deleting={isDeletingCollectionDialog}
                    onOpenChange={(open) => !open && setCollectionToDelete(null)}
                    onConfirm={confirmDeleteCollection}
                />

                {/* Delete Script Confirmation Dialog */}
                <DeleteScriptDialog
                    open={isDeleteDialogOpen}
                    script={scriptToDelete}
                    deleting={isDeleting}
                    onOpenChange={setIsDeleteDialogOpen}
                    onConfirm={confirmDeleteScript}
                />
            </DndContext >
        </>
    );
};

ScriptsSidebarComponent.displayName = 'ScriptsSidebar'

export const ScriptsSidebar = memo(ScriptsSidebarComponent);
