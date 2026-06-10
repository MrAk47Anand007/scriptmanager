'use client'

import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, type ChangeEvent, memo } from 'react';
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
import { selectOpsProjects } from '@/features/ops/selectors';
import {
    createProject, deleteProject,
} from '@/features/ops/opsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    FileCode, Plus, Folder, MoreVertical, Trash2, ChevronRight, ChevronDown,
    GripVertical, Search, LayoutTemplate, Copy, Loader2, Layers, FolderOpen, AlertTriangle,
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
import {
    hasDesktopScriptsRuntime,
    inspectDesktopCollectionWorkspace,
    inspectDesktopFolder,
    manageDesktopCollectionPythonEnv,
} from '@/lib/scriptsRuntimeClient';

type BrowserFolderFile = {
    relativePath: string
    content: string
}

type FolderInspection = {
    hasVenv: boolean
    venvPath: string | null
    interpreterPath: string | null
    manifests: string[]
}

type CollectionWorkspaceStatus = {
    collection: Collection
    workspacePath: string | null
    hasVenv: boolean
    venvPath: string | null
    interpreterPath: string | null
    manifests: string[]
}

const RUNTIME_OPTIONS: Array<{ value: NonNullable<Collection['runtime_preset']>; label: string }> = [
    { value: 'general', label: 'General' },
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'JavaScript / Node' },
    { value: 'shell', label: 'Shell' },
    { value: 'powershell', label: 'PowerShell' },
]

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
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionRuntimePreset, setNewCollectionRuntimePreset] = useState<NonNullable<Collection['runtime_preset']>>('general');
    const [newCollectionPythonTools, setNewCollectionPythonTools] = useState(false);
    const [parentProjectId, setParentProjectId] = useState<string | null>(null);
    const [parentCreationCollectionId, setParentCreationCollectionId] = useState<string | null>(null);
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
    const [folderRuntimePreset, setFolderRuntimePreset] = useState<NonNullable<Collection['runtime_preset']>>('general');
    const [folderPythonTools, setFolderPythonTools] = useState(false);
    const [folderCreateVenvIfMissing, setFolderCreateVenvIfMissing] = useState(false);
    const [folderInspection, setFolderInspection] = useState<FolderInspection | null>(null);
    const [isOpeningFolder, setIsOpeningFolder] = useState(false);
    const [openFolderError, setOpenFolderError] = useState('');
    const [browserFolderFiles, setBrowserFolderFiles] = useState<BrowserFolderFile[]>([]);
    const filePickerRef = useRef<HTMLInputElement | null>(null);
    const [collectionToConvert, setCollectionToConvert] = useState<Collection | null>(null);
    const [convertCollectionName, setConvertCollectionName] = useState('');
    const [isConvertingCollection, setIsConvertingCollection] = useState(false);
    const [hasDesktopFolderPicker, setHasDesktopFolderPicker] = useState(false);
    const [pythonEnvCollection, setPythonEnvCollection] = useState<Collection | null>(null);
    const [pythonEnvStatus, setPythonEnvStatus] = useState<CollectionWorkspaceStatus | null>(null);
    const [isPythonEnvLoading, setIsPythonEnvLoading] = useState(false);
    const [pythonEnvError, setPythonEnvError] = useState('');

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
    const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
    const [isDeletingCollectionDialog, setIsDeletingCollectionDialog] = useState(false);

    const { settings } = useAppSelector((state) => state.settings);
    const isModeActive = useAppSelector((state) => state.ops.isModeActive);
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

    useEffect(() => {
        if (newCollectionRuntimePreset === 'python') {
            setNewCollectionPythonTools(true);
        }
    }, [newCollectionRuntimePreset]);

    useEffect(() => {
        if (folderRuntimePreset === 'python') {
            setFolderPythonTools(true);
            if (!folderInspection?.hasVenv) {
                setFolderCreateVenvIfMissing(true);
            }
        }
    }, [folderInspection?.hasVenv, folderRuntimePreset]);

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

    const handleActivateScript = useCallback((scriptId: string) => {
        dispatch(setActiveScript(scriptId));
    }, [dispatch]);

    const handleDuplicateScript = useCallback((scriptId: string) => {
        dispatch(duplicateScript(scriptId));
    }, [dispatch]);

    const handleDeleteScriptRequest = useCallback((script: Script) => {
        setScriptToDelete(script);
        setDeleteFromGist(script.sync_to_gist || !!script.gist_id);
        setIsDeleteDialogOpen(true);
    }, []);

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

    const openCreateCollectionDialog = (projectId?: string | null, parentId?: string | null) => {
        setParentProjectId(projectId ?? null);
        setParentCreationCollectionId(parentId ?? null);
        setNewCollectionName('');
        setNewCollectionRuntimePreset('general');
        setNewCollectionPythonTools(false);
        setIsCreatingCollection(true);
    };

    const resetCollectionCreationState = () => {
        setNewCollectionName('');
        setNewCollectionRuntimePreset('general');
        setNewCollectionPythonTools(false);
        setParentProjectId(null);
        setParentCreationCollectionId(null);
        setIsCreatingCollection(false);
    };

    const detectFolderWorkspaceState = useCallback(async (selectedPath: string) => {
        if (!hasDesktopScriptsRuntime()) {
            return null;
        }

        const inspection = await inspectDesktopFolder(selectedPath);
        setFolderInspection(inspection);
        if (inspection.hasVenv) {
            setFolderPythonTools(true);
            setFolderCreateVenvIfMissing(false);
        }
        return inspection;
    }, []);

    const openFolderDialog = () => {
        setFolderMode('temporary');
        setFolderPath('');
        setFolderCollectionName('');
        setFolderRuntimePreset('general');
        setFolderPythonTools(false);
        setFolderCreateVenvIfMissing(false);
        setFolderInspection(null);
        setOpenFolderError('');
        setBrowserFolderFiles([]);
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

    const openPythonEnvironmentDialog = useCallback(async (collection: Collection) => {
        setPythonEnvCollection(collection);
        setPythonEnvStatus(null);
        setPythonEnvError('');
        setIsPythonEnvLoading(true);

        try {
            const status = await inspectDesktopCollectionWorkspace(collection.id);
            setPythonEnvStatus(status);
        } catch (error) {
            setPythonEnvError(error instanceof Error ? error.message : 'Failed to inspect collection workspace');
        } finally {
            setIsPythonEnvLoading(false);
        }
    }, []);

    const handleCreateOrRepairPythonEnv = useCallback(async (recreate = false) => {
        if (!pythonEnvCollection) {
            return;
        }

        setPythonEnvError('');
        setIsPythonEnvLoading(true);
        try {
            const status = await manageDesktopCollectionPythonEnv(pythonEnvCollection.id, recreate);
            setPythonEnvStatus(status);
            await dispatch(fetchCollections());
        } catch (error) {
            setPythonEnvError(error instanceof Error ? error.message : 'Failed to manage Python environment');
        } finally {
            setIsPythonEnvLoading(false);
        }
    }, [dispatch, pythonEnvCollection]);

    const handleRevealWorkspace = useCallback(async () => {
        const workspacePath = pythonEnvStatus?.workspacePath;
        if (!workspacePath || !window.scriptManagerDesktop?.revealPath) {
            return;
        }
        await window.scriptManagerDesktop.revealPath(workspacePath);
    }, [pythonEnvStatus?.workspacePath]);

    const selectFolderPath = async () => {
        setOpenFolderError('');

        if (window.scriptManagerDesktop?.selectFolder) {
            const selected = await window.scriptManagerDesktop.selectFolder();
            if (selected) {
                setFolderPath(selected);
                await detectFolderWorkspaceState(selected);
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
        setFolderInspection(null);
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
            const result = hasDesktopFolderPicker
                ? await dispatch(openScriptsFolder({
                    folderPath: folderPath.trim(),
                    mode: folderMode,
                    collectionName: folderMode === 'collection' ? folderCollectionName.trim() || undefined : undefined,
                    runtimePreset: folderRuntimePreset,
                    pythonToolchainEnabled: folderInspection?.hasVenv ? true : folderPythonTools,
                    createVenvIfMissing: folderInspection?.hasVenv ? false : folderCreateVenvIfMissing,
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
            const { finalName, content, language } = inferScriptDraft(newScriptName, parentCollectionId);

            const result = await dispatch(createScript({
                name: finalName,
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
        if (!newCollectionName.trim() || isSubmittingCollection) return;
        setIsSubmittingCollection(true);
        try {
            const createdCollection = await dispatch(createCollection({
                name: newCollectionName.trim(),
                projectId: parentProjectId,
                parentId: parentCreationCollectionId,
                runtimePreset: newCollectionRuntimePreset,
                pythonToolchainEnabled: newCollectionRuntimePreset === 'python' ? true : newCollectionPythonTools,
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
        setSaveAsTemplateName(script.name);
        setSaveAsDescription('');
        setSaveAsCategory('general');
        setSaveAsError('');
        setSaveAsLoading(false);
        setIsSaveAsTemplateOpen(true);
    }, []);

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

    const isDeleteTemporaryWorkspace = Boolean(collectionToDelete?.is_temporary);
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

                    {isCreatingCollection && (
                        <div className="p-2 border-b bg-blue-50 dark:bg-blue-900/20 dark:border-slate-800">
                            <Input
                                autoFocus
                                placeholder="Collection Name"
                                value={newCollectionName}
                                onChange={(e) => setNewCollectionName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                                className="h-7 text-xs mb-2 bg-white dark:bg-slate-950 dark:border-slate-700"
                                disabled={isSubmittingCollection}
                            />
                            {hasDesktopFolderPicker && (
                                <>
                                    <Select
                                        value={newCollectionRuntimePreset}
                                        onValueChange={(value: NonNullable<Collection['runtime_preset']>) => setNewCollectionRuntimePreset(value)}
                                        disabled={isSubmittingCollection}
                                    >
                                        <SelectTrigger className="h-7 text-xs mb-2 bg-white dark:bg-slate-950 dark:border-slate-700">
                                            <SelectValue placeholder="Primary runtime" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {RUNTIME_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="mb-2 flex items-start space-x-2 rounded-md border border-blue-200/70 bg-white/70 px-2 py-2 dark:border-slate-700 dark:bg-slate-950/70">
                                        <Checkbox
                                            id="collection-python-tools"
                                            checked={newCollectionPythonTools}
                                            onCheckedChange={(checked) => setNewCollectionPythonTools(Boolean(checked))}
                                            disabled={newCollectionRuntimePreset === 'python' || isSubmittingCollection}
                                        />
                                        <div className="space-y-1">
                                            <Label htmlFor="collection-python-tools" className="text-xs font-medium">
                                                Enable Python tools
                                            </Label>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                Create and use a collection-level <code>.venv</code> for Python scripts inside this workspace.
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="flex gap-2">
                                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreateCollection} disabled={isSubmittingCollection || !newCollectionName.trim()}>
                                    {isSubmittingCollection ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                                    {isSubmittingCollection ? 'Creating...' : 'Create'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={resetCollectionCreationState} disabled={isSubmittingCollection}>Cancel</Button>
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
                                {hasDesktopFolderPicker
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
                                        disabled={isOpeningFolder || !hasDesktopFolderPicker}
                                    />
                                    <Button type="button" variant="outline" onClick={selectFolderPath} disabled={isOpeningFolder}>
                                        Browse
                                    </Button>
                                </div>
                                {!hasDesktopFolderPicker && (
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

                            {hasDesktopFolderPicker && (
                                <>
                                    <div className="flex flex-col gap-2">
                                        <Label>Primary Runtime</Label>
                                        <Select value={folderRuntimePreset} onValueChange={(value: NonNullable<Collection['runtime_preset']>) => setFolderRuntimePreset(value)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {RUNTIME_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="rounded-md border border-slate-200 px-3 py-3 dark:border-slate-700">
                                        <div className="flex items-start space-x-2">
                                            <Checkbox
                                                id="folder-python-tools"
                                                checked={folderInspection?.hasVenv ? true : folderPythonTools}
                                                onCheckedChange={(checked) => {
                                                    if (folderInspection?.hasVenv) return;
                                                    setFolderPythonTools(Boolean(checked));
                                                }}
                                                disabled={Boolean(folderInspection?.hasVenv) || folderRuntimePreset === 'python'}
                                            />
                                            <div className="space-y-1">
                                                <Label htmlFor="folder-python-tools" className="text-sm font-medium">
                                                    Enable Python tools
                                                </Label>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                    Use a collection-level <code>.venv</code> inside this workspace for Python scripts.
                                                </p>
                                                {folderInspection?.hasVenv && (
                                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                                        Existing <code>.venv</code> detected. ScriptManager will adopt it automatically.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {!folderInspection?.hasVenv && folderPythonTools && (
                                            <div className="mt-3 flex items-start space-x-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                                                <Checkbox
                                                    id="folder-create-venv"
                                                    checked={folderCreateVenvIfMissing}
                                                    onCheckedChange={(checked) => setFolderCreateVenvIfMissing(Boolean(checked))}
                                                />
                                                <div className="space-y-1">
                                                    <Label htmlFor="folder-create-venv" className="text-sm font-medium">
                                                        Create <code>.venv</code> if missing
                                                    </Label>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                                        ScriptManager will create a Python virtual environment inside the selected folder after linking it.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {folderInspection && (
                                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60">
                                            <div className="font-medium text-slate-700 dark:text-slate-200">
                                                Workspace scan
                                            </div>
                                            <div className="mt-1 text-slate-500 dark:text-slate-400">
                                                {folderInspection.hasVenv
                                                    ? `Python environment ready at ${folderInspection.venvPath}`
                                                    : 'No .venv detected in this folder yet.'}
                                            </div>
                                            {folderInspection.manifests.length > 0 && (
                                                <div className="mt-1 text-slate-500 dark:text-slate-400">
                                                    Detected manifests: {folderInspection.manifests.join(', ')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
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
                <Dialog open={!!pythonEnvCollection} onOpenChange={(open) => !open && setPythonEnvCollection(null)}>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Python Environment</DialogTitle>
                            <DialogDescription>
                                {pythonEnvCollection
                                    ? `Manage Python tooling for ${pythonEnvCollection.name}.`
                                    : 'Manage collection Python tooling.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2 text-sm">
                            {isPythonEnvLoading && (
                                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Loading workspace status...</span>
                                </div>
                            )}
                            {pythonEnvError && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                                    {pythonEnvError}
                                </div>
                            )}
                            {pythonEnvStatus && (
                                <div className="space-y-3">
                                    <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workspace</div>
                                        <div className="mt-1 break-all text-xs text-slate-700 dark:text-slate-200">
                                            {pythonEnvStatus.workspacePath ?? 'No linked workspace path'}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Python Status</div>
                                        <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                                            {pythonEnvStatus.hasVenv ? 'Virtual environment detected and ready.' : 'No .venv detected yet.'}
                                        </div>
                                        {pythonEnvStatus.interpreterPath && (
                                            <div className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">
                                                Interpreter: {pythonEnvStatus.interpreterPath}
                                            </div>
                                        )}
                                        {pythonEnvStatus.manifests.length > 0 && (
                                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                Detected manifests: {pythonEnvStatus.manifests.join(', ')}
                                            </div>
                                        )}
                                        {pythonEnvStatus.hasVenv && pythonEnvStatus.manifests.length > 0 && (
                                            <div className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                                                Python environment is ready. Install dependencies from the detected manifest when you need them.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="flex-wrap gap-2">
                            <Button variant="outline" onClick={handleRevealWorkspace} disabled={!pythonEnvStatus?.workspacePath}>
                                Reveal Folder
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => handleCreateOrRepairPythonEnv(false)}
                                disabled={isPythonEnvLoading || !pythonEnvCollection?.folder_path}
                            >
                                Create Venv
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => handleCreateOrRepairPythonEnv(true)}
                                disabled={isPythonEnvLoading || !pythonEnvCollection?.folder_path}
                            >
                                Recreate Venv
                            </Button>
                            <Button variant="ghost" onClick={() => setPythonEnvCollection(null)}>
                                Close
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

                <Dialog open={!!collectionToDelete} onOpenChange={(open) => !isDeletingCollectionDialog && !open && setCollectionToDelete(null)}>
                    <DialogContent className="overflow-hidden border-white/10 bg-[#0b1020] p-0 text-slate-100 shadow-2xl sm:max-w-lg">
                        <div className="border-b border-white/10 px-6 py-5">
                            <DialogHeader className="space-y-3 text-left">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
                                        <AlertTriangle className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <DialogTitle className="text-lg text-white">Delete Collection</DialogTitle>
                                        <DialogDescription className="text-sm text-slate-300">
                                            {collectionToDelete?.name}
                                        </DialogDescription>
                                    </div>
                                </div>
                            </DialogHeader>
                        </div>

                        <div className="space-y-4 px-6 py-5">
                            <p className="text-sm leading-6 text-slate-300">
                                {isDeleteTemporaryWorkspace
                                    ? 'This temporary workspace will be removed from ScriptManager along with its imported script entries.'
                                    : hasCollectionFolder
                                        ? 'This collection will be deleted. Managed workspace files will be removed from disk, while linked external folders stay untouched.'
                                        : 'This collection will be deleted and its scripts will move back to Unsorted.'}
                            </p>

                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                                <div className="font-medium text-slate-100">This action cannot be automatically undone.</div>
                                {isDeletingCollectionDialog && (
                                    <div className="mt-3 flex items-center gap-2 text-slate-400">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>{hasCollectionFolder ? 'Removing local workspace...' : 'Deleting collection...'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <DialogFooter className="border-t border-white/10 px-6 py-4 sm:justify-end">
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                                <Button
                                    variant="outline"
                                    className="border-white/10 bg-transparent text-slate-200 hover:bg-white/5 hover:text-white"
                                    onClick={() => setCollectionToDelete(null)}
                                    disabled={isDeletingCollectionDialog}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    className="min-w-36 bg-red-500 text-white hover:bg-red-400"
                                    onClick={confirmDeleteCollection}
                                    disabled={isDeletingCollectionDialog}
                                >
                                    {isDeletingCollectionDialog ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        isDeleteTemporaryWorkspace ? 'Remove Workspace' : 'Delete Collection'
                                    )}
                                </Button>
                            </div>
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

ScriptsSidebarComponent.displayName = 'ScriptsSidebar'

export const ScriptsSidebar = memo(ScriptsSidebarComponent);
