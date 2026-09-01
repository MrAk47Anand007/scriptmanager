

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import type { Collection } from '@/features/scripts/scriptsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { FolderOpen, Loader2 } from 'lucide-react';
import { hasDesktopScriptsRuntime, inspectDesktopFolder } from '@/lib/scriptsRuntimeClient';
import { RUNTIME_OPTIONS } from './CreateCollectionDialog';

export type BrowserFolderFile = {
    relativePath: string
    content: string
}

type FolderInspection = {
    hasVenv: boolean
    venvPath: string | null
    interpreterPath: string | null
    manifests: string[]
}

export interface OpenFolderSubmitValues {
    folderPath: string;
    mode: 'temporary' | 'collection';
    collectionName?: string;
    runtimePreset: NonNullable<Collection['runtime_preset']>;
    pythonToolchainEnabled: boolean;
    createVenvIfMissing: boolean;
    files: BrowserFolderFile[];
}

export interface OpenFolderDialogProps {
    open: boolean;
    /** Whether the desktop runtime folder picker is available. */
    hasDesktopFolderPicker: boolean;
    /** True while the sidebar is dispatching the open/import-folder thunk. */
    submitting: boolean;
    onOpenChange: (open: boolean) => void;
    /** Returns an error message to display, or null on success (the sidebar closes the dialog). */
    onSubmit: (values: OpenFolderSubmitValues) => Promise<string | null>;
}

export function OpenFolderDialog({
    open,
    hasDesktopFolderPicker,
    submitting,
    onOpenChange,
    onSubmit,
}: OpenFolderDialogProps) {
    const [folderPath, setFolderPath] = useState('');
    const [folderMode, setFolderMode] = useState<'temporary' | 'collection'>('temporary');
    const [folderCollectionName, setFolderCollectionName] = useState('');
    const [folderRuntimePreset, setFolderRuntimePreset] = useState<NonNullable<Collection['runtime_preset']>>('general');
    const [folderPythonTools, setFolderPythonTools] = useState(false);
    const [folderCreateVenvIfMissing, setFolderCreateVenvIfMissing] = useState(false);
    const [folderInspection, setFolderInspection] = useState<FolderInspection | null>(null);
    const [openFolderError, setOpenFolderError] = useState('');
    const [browserFolderFiles, setBrowserFolderFiles] = useState<BrowserFolderFile[]>([]);
    const filePickerRef = useRef<HTMLInputElement | null>(null);

    // Reset form state each time the dialog opens
    useEffect(() => {
        if (open) {
            setFolderMode('temporary');
            setFolderPath('');
            setFolderCollectionName('');
            setFolderRuntimePreset('general');
            setFolderPythonTools(false);
            setFolderCreateVenvIfMissing(false);
            setFolderInspection(null);
            setOpenFolderError('');
            setBrowserFolderFiles([]);
        }
    }, [open]);

    useEffect(() => {
        if (folderRuntimePreset === 'python') {
            setFolderPythonTools(true);
            if (!folderInspection?.hasVenv) {
                setFolderCreateVenvIfMissing(true);
            }
        }
    }, [folderInspection?.hasVenv, folderRuntimePreset]);

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
        if (!folderPath.trim() || submitting) return;

        setOpenFolderError('');
        const error = await onSubmit({
            folderPath: folderPath.trim(),
            mode: folderMode,
            collectionName: folderMode === 'collection' ? folderCollectionName.trim() || undefined : undefined,
            runtimePreset: folderRuntimePreset,
            pythonToolchainEnabled: folderInspection?.hasVenv ? true : folderPythonTools,
            createVenvIfMissing: folderInspection?.hasVenv ? false : folderCreateVenvIfMissing,
            files: browserFolderFiles,
        });
        if (error) {
            setOpenFolderError(error);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
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
                                    disabled={submitting || !hasDesktopFolderPicker}
                                />
                                <Button type="button" variant="outline" onClick={selectFolderPath} disabled={submitting}>
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
                                    disabled={submitting}
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
                        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button onClick={handleOpenFolderSubmit} disabled={!folderPath.trim() || submitting}>
                            {submitting ? (
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
            <input
                ref={filePickerRef}
                type="file"
                className="hidden"
                multiple
                // @ts-expect-error Chromium directory picker attribute
                webkitdirectory=""
                onChange={handleFolderInputChange}
            />
        </>
    );
}
