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
    FileCode, Plus, Folder, Search, LayoutTemplate, Loader2, Layers, FolderOpen,
} from 'lucide-react';
import { QuickSwitcher } from './QuickSwitcher';
import { CreateScriptDialog } from './sidebar/CreateScriptDialog';
import { CreateCollectionDialog } from './sidebar/CreateCollectionDialog';
import { OpenFolderDialog, type OpenFolderSubmitValues } from './sidebar/OpenFolderDialog';
import { DeleteScriptDialog } from './sidebar/DeleteScriptDialog';
import { DeleteCollectionDialog } from './sidebar/DeleteCollectionDialog';
import { PythonEnvDialog } from './sidebar/PythonEnvDialog';
import { SaveAsTemplateDialog } from './sidebar/SaveAsTemplateDialog';
import { ScriptTree, getCollectionTreeKey, type ScriptTreeCallbacks } from './sidebar/ScriptTree';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensors, useSensor, PointerSensor } from '@dnd-kit/core';
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

    const toggleProject = useCallback((id: string) => {
        setExpandedProjects(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

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

    const handleDeleteProject = useCallback(async (id: string) => {
        if (confirm('Delete this project? Collections will become unassigned (not deleted).')) {
            await dispatch(deleteProject(id));
        }
    }, [dispatch]);

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

    const toggleCollection = useCallback((id: string) => {
        setExpandedCollections(prev => ({ ...prev, [id]: !prev[id] }));
    }, []);

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

    const openCreateScriptDialog = useCallback((collectionId?: string) => {
        setParentCollectionId(collectionId || null);
        setIsCreateScriptOpen(true);
    }, []);

    const openCreateCollectionDialog = useCallback((projectId?: string | null, parentId?: string | null) => {
        setParentProjectId(projectId ?? null);
        setParentCreationCollectionId(parentId ?? null);
        setIsCreatingCollection(true);
    }, []);

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

    const handleCreateScript = openCreateScriptDialog;

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

    // Covers both saved collections and temporary workspaces — confirmDeleteCollection
    // branches on `is_temporary` when the user confirms.
    const handleDeleteCollection = useCallback((collection: Collection) => {
        setCollectionToDelete(collection);
    }, []);

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

    const openConvertCollectionDialog = useCallback((collection: Collection) => {
        setCollectionToConvert(collection);
        setConvertCollectionName(collection.name.replace(/\s+\(Temporary\)$/i, ''));
    }, []);

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

    // Stable callback bag for the virtualized tree — keeps ScriptTree's memo effective.
    const treeCallbacks = useMemo<ScriptTreeCallbacks>(() => ({
        onToggleCollection: toggleCollection,
        onToggleProject: toggleProject,
        onActivateScript: handleActivateScript,
        onSaveAsTemplate: openSaveAsTemplate,
        onDuplicateScript: handleDuplicateScript,
        onDeleteScript: handleDeleteScriptRequest,
        onDeleteCollection: handleDeleteCollection,
        onCreateScript: openCreateScriptDialog,
        onCreateCollection: openCreateCollectionDialog,
        onConvertCollection: openConvertCollectionDialog,
        onManagePythonEnv: openPythonEnvironmentDialog,
        onDeleteProject: handleDeleteProject,
    }), [
        toggleCollection, toggleProject, handleActivateScript, openSaveAsTemplate,
        handleDuplicateScript, handleDeleteScriptRequest, handleDeleteCollection,
        openCreateScriptDialog, openCreateCollectionDialog, openConvertCollectionDialog,
        openPythonEnvironmentDialog, handleDeleteProject,
    ]);

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

                    <ScriptTree
                        isOpsMode={isModeActive}
                        searchActive={Boolean(searchQuery.trim())}
                        isLoading={status === 'loading'}
                        noMatchMessage={searchQuery.trim() && filteredScripts.length === 0 && status !== 'loading' ? `No scripts match "${searchQuery}"` : null}
                        temporaryCollections={temporaryCollections}
                        savedCollections={savedCollections}
                        collectionsByTreeKey={savedCollectionsByTreeKey}
                        rootSavedCollections={rootSavedCollections}
                        projects={projects}
                        projectCollectionCounts={projectCollectionCounts}
                        scriptsByCollection={grouped.result}
                        unsortedScripts={grouped.unsorted}
                        expandedCollections={expandedCollections}
                        expandedProjects={expandedProjects}
                        activeScriptId={activeScriptId}
                        pendingCollectionDeleteId={pendingCollectionDeleteId}
                        hasDesktopFolderPicker={hasDesktopFolderPicker}
                        callbacks={treeCallbacks}
                    />

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
                    onOpenChange={(open) => !isDeleting && setIsDeleteDialogOpen(open)}
                    onConfirm={confirmDeleteScript}
                />
            </DndContext >
        </>
    );
};

ScriptsSidebarComponent.displayName = 'ScriptsSidebar'

export const ScriptsSidebar = memo(ScriptsSidebarComponent);
