'use client'

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
    setActiveScript, createScript, createCollection, deleteCollection, moveScript,
    saveAsTemplate,
} from '@/features/scripts/scriptsSlice';
import type { Script, Collection, ScriptTemplate } from '@/features/scripts/scriptsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
    FileCode, Plus, Folder, MoreVertical, Trash2, ChevronRight, ChevronDown,
    GripVertical, Search, LayoutTemplate,
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

const GistSyncStatus = () => {
    const { settings } = useAppSelector((state) => state.settings);
    const isEnabled = settings['gist_sync_enabled'] === 'true';

    return (
        <span className={cn("font-medium", isEnabled ? "text-green-600" : "text-slate-400")}>
            {isEnabled ? "Auto" : "Manual"}
        </span>
    );
};

// Draggable Script Component
const DraggableScript = ({
    script,
    isActive,
    onClick,
    onSaveAsTemplate,
}: {
    script: Script;
    isActive: boolean;
    onClick: () => void;
    onSaveAsTemplate: () => void;
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
                    {...attributes}
                    {...listeners}
                    onClick={onClick}
                    style={{ opacity: isDragging ? 0.5 : 1 }}
                    className={cn(
                        "flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors group",
                        isActive
                            ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                            : "text-slate-600 hover:bg-slate-200/50"
                    )}
                >
                    <FileCode className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate text-xs flex-1">{script.name}</span>
                    <GripVertical className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onSaveAsTemplate}>
                    <LayoutTemplate className="mr-2 h-4 w-4" /> Save as Template
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
    onCreateScript
}: {
    collection: Collection,
    isExpanded: boolean,
    toggle: () => void,
    children: React.ReactNode,
    onDelete: () => void,
    onCreateScript: () => void
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: collection.id,
        data: { type: 'collection', collection }
    });

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div ref={setNodeRef} className={cn("space-y-0.5 rounded-md transition-colors", isOver && "bg-blue-50 ring-1 ring-blue-200")}>
                    <div
                        className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-slate-200/50 group cursor-pointer"
                        onClick={toggle}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        ) : (
                            <ChevronRight className="h-3 w-3 text-slate-400" />
                        )}
                        <Folder className={cn("h-4 w-4", isOver ? "text-blue-500" : "text-slate-500")} />
                        <span className="truncate flex-1 text-slate-700">{collection.name}</span>
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
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
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
                <ContextMenuItem className="text-red-600 focus:text-red-600" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Collection
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

export const ScriptsSidebar = () => {
    const dispatch = useAppDispatch();
    const {
        items: scripts,
        collections,
        activeScriptId,
        activeScriptContent,
        templates,
    } = useAppSelector((state) => state.scripts);
    const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [activeDragScript, setActiveDragScript] = useState<Script | null>(null);

    // New Script Dialog State
    const [isCreateScriptOpen, setIsCreateScriptOpen] = useState(false);
    const [newScriptName, setNewScriptName] = useState('');
    const [parentCollectionId, setParentCollectionId] = useState<string | null>(null);
    const [syncToGistOverride, setSyncToGistOverride] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);

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

    const { settings } = useAppSelector((state) => state.settings);

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

    // Initial data fetching is centralized in page.tsx

    // Initialize sync override based on global setting when opening dialog
    useEffect(() => {
        if (isCreateScriptOpen) {
            setSyncToGistOverride(settings['gist_sync_enabled'] === 'true');
            setNewScriptName('');
        }
    }, [isCreateScriptOpen, settings]);

    const toggleCollection = (id: string) => {
        setExpandedCollections(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const openCreateScriptDialog = (collectionId?: string) => {
        setParentCollectionId(collectionId || null);
        setIsCreateScriptOpen(true);
    };

    const handleCreateScriptSubmit = async () => {
        if (!newScriptName.trim()) return;

        const result = await dispatch(createScript({
            name: newScriptName,
            syncToGist: syncToGistOverride
        }));

        if (createScript.fulfilled.match(result)) {
            if (parentCollectionId) {
                await dispatch(moveScript({ scriptId: result.payload.id, collectionId: parentCollectionId }));
                setExpandedCollections(prev => ({ ...prev, [parentCollectionId]: true }));
            }
            setIsCreateScriptOpen(false);
            setNewScriptName('');
        }
    };

    const handleCreateScript = async (collectionId?: string) => {
        openCreateScriptDialog(collectionId);
    };

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim()) return;
        await dispatch(createCollection(newCollectionName));
        setNewCollectionName('');
        setIsCreatingCollection(false);
    };

    const handleDeleteCollection = async (id: string) => {
        if (confirm("Delete this collection? Scripts inside will be moved to Unsorted.")) {
            await dispatch(deleteCollection(id));
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const script = scripts.find(s => s.id === active.id);
        if (script) setActiveDragScript(script);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDragScript(null);

        if (!over) return;

        const scriptId = active.id as string;
        const collectionId = over.id as string;

        const script = scripts.find(s => s.id === scriptId);
        if (script && script.collection_id !== collectionId) {
            await dispatch(moveScript({ scriptId, collectionId }));
            setExpandedCollections(prev => ({ ...prev, [collectionId]: true }));
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
            if (saveAsSourceScript.id === activeScriptId && activeScriptContent) {
                content = activeScriptContent
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
        if (!searchQuery.trim()) return scripts;
        const q = searchQuery.toLowerCase();
        return scripts.filter(s =>
            s.name.toLowerCase().includes(q) ||
            (s.description ?? '').toLowerCase().includes(q)
        );
    }, [scripts, searchQuery]);

    // Auto-expand collections that contain matching scripts when searching
    useEffect(() => {
        if (!searchQuery.trim()) return;
        const toExpand: Record<string, boolean> = {};
        filteredScripts.forEach(s => {
            if (s.collection_id) toExpand[s.collection_id] = true;
        });
        setExpandedCollections(prev => ({ ...prev, ...toExpand }));
    }, [filteredScripts, searchQuery]);

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
            <div className="w-64 border-r flex flex-col bg-slate-50 h-full">
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-xs tracking-wider text-slate-500 uppercase">SCRIPTS</h2>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Quick open (Ctrl+P)" onClick={() => setQuickSwitcherOpen(true)}>
                            <Search className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <Plus className="h-4 w-4 text-slate-600" />
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
                                <DropdownMenuItem onClick={() => setIsCreatingCollection(true)}>
                                    <Folder className="mr-2 h-4 w-4" /> New Collection
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Inline search bar */}
                <div className="px-2 pt-2 pb-1">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                        <Input
                            placeholder="Filter scripts…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-7 pl-6 text-xs bg-white"
                        />
                    </div>
                </div>

                {isCreatingCollection && (
                    <div className="p-2 border-b bg-blue-50">
                        <Input
                            autoFocus
                            placeholder="Collection Name"
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                            className="h-7 text-xs mb-2 bg-white"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreateCollection}>Create</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={() => setIsCreatingCollection(false)}>Cancel</Button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {searchQuery.trim() && filteredScripts.length === 0 && (
                        <div className="px-2 py-6 text-xs text-slate-400 text-center italic">No scripts match "{searchQuery}"</div>
                    )}
                    {collections.map(collection => (
                        <DroppableCollection
                            key={collection.id}
                            collection={collection}
                            isExpanded={!!expandedCollections[collection.id]}
                            toggle={() => toggleCollection(collection.id)}
                            onDelete={() => handleDeleteCollection(collection.id)}
                            onCreateScript={() => handleCreateScript(collection.id)}
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
                                />
                            ))}
                        </DroppableCollection>
                    ))}

                    {grouped.unsorted.length > 0 && collections.length > 0 && (
                        <div className="px-2 py-2 text-xs font-semibold text-slate-400 uppercase">Unsorted</div>
                    )}
                    {grouped.unsorted.map((script) => (
                        <DraggableScript
                            key={script.id}
                            script={script}
                            isActive={activeScriptId === script.id}
                            onClick={() => dispatch(setActiveScript(script.id))}
                            onSaveAsTemplate={() => openSaveAsTemplate(script)}
                        />
                    ))}
                </div>

                <div className="p-2 border-t bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
                    <span>
                        Gist Sync: <GistSyncStatus />
                    </span>
                </div>
            </div>
            {typeof window !== 'undefined' && createPortal(
                <DragOverlay>
                    {activeDragScript && (
                        <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md bg-white border border-slate-200 shadow-lg opacity-80 w-64">
                            <FileCode className="h-3.5 w-3.5" />
                            <span className="truncate text-xs">{activeDragScript.name}</span>
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}

            {/* Create new script dialog */}
            <Dialog open={isCreateScriptOpen} onOpenChange={setIsCreateScriptOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create New Script</DialogTitle>
                        <DialogDescription>
                            Enter a name for your new script. It will be saved to your local scripts folder.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name" className="text-right text-left">
                                Script Name
                            </Label>
                            <Input
                                id="name"
                                placeholder="myscript.py"
                                value={newScriptName}
                                onChange={(e) => setNewScriptName(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateScriptSubmit()}
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="syncToGist"
                                checked={syncToGistOverride}
                                onCheckedChange={(checked) => setSyncToGistOverride(!!checked)}
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
                        <Button variant="secondary" onClick={() => setIsCreateScriptOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateScriptSubmit} disabled={!newScriptName.trim()}>
                            Create Script
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
        </DndContext>
        </>
    );
};
