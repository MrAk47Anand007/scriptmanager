

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { Collection } from '@/features/scripts/scriptsSlice';
import {
    inspectDesktopCollectionWorkspace,
    manageDesktopCollectionPythonEnv,
} from '@/lib/scriptsRuntimeClient';

type CollectionWorkspaceStatus = {
    collection: Collection
    workspacePath: string | null
    hasVenv: boolean
    venvPath: string | null
    interpreterPath: string | null
    manifests: string[]
}

export interface PythonEnvDialogProps {
    /** The collection whose Python tooling is being managed; the dialog is open while this is set. */
    collection: Collection | null;
    /** True while inspecting/managing the environment. Kept in the sidebar so its busy banner can react. */
    loading: boolean;
    onLoadingChange: (loading: boolean) => void;
    onOpenChange: (open: boolean) => void;
    /** Called after the environment changed so the sidebar can refresh collections. */
    onEnvChanged: () => Promise<void>;
}

export function PythonEnvDialog({
    collection,
    loading,
    onLoadingChange,
    onOpenChange,
    onEnvChanged,
}: PythonEnvDialogProps) {
    const [pythonEnvStatus, setPythonEnvStatus] = useState<CollectionWorkspaceStatus | null>(null);
    const [pythonEnvError, setPythonEnvError] = useState('');

    // Inspect the workspace each time the dialog opens for a collection
    useEffect(() => {
        if (!collection) return;

        let cancelled = false;
        setPythonEnvStatus(null);
        setPythonEnvError('');
        onLoadingChange(true);

        (async () => {
            try {
                const status = await inspectDesktopCollectionWorkspace(collection.id);
                if (!cancelled) setPythonEnvStatus(status);
            } catch (error) {
                if (!cancelled) {
                    setPythonEnvError(error instanceof Error ? error.message : 'Failed to inspect collection workspace');
                }
            } finally {
                onLoadingChange(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection]);

    const handleCreateOrRepairPythonEnv = useCallback(async (recreate = false) => {
        if (!collection) {
            return;
        }

        setPythonEnvError('');
        onLoadingChange(true);
        try {
            const status = await manageDesktopCollectionPythonEnv(collection.id, recreate);
            setPythonEnvStatus(status);
            await onEnvChanged();
        } catch (error) {
            setPythonEnvError(error instanceof Error ? error.message : 'Failed to manage Python environment');
        } finally {
            onLoadingChange(false);
        }
    }, [collection, onEnvChanged, onLoadingChange]);

    const handleRevealWorkspace = useCallback(async () => {
        const workspacePath = pythonEnvStatus?.workspacePath;
        if (!workspacePath || !window.scriptManagerDesktop?.revealPath) {
            return;
        }
        await window.scriptManagerDesktop.revealPath(workspacePath);
    }, [pythonEnvStatus?.workspacePath]);

    return (
        <Dialog open={!!collection} onOpenChange={(open) => !open && onOpenChange(open)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Python Environment</DialogTitle>
                    <DialogDescription>
                        {collection
                            ? `Manage Python tooling for ${collection.name}.`
                            : 'Manage collection Python tooling.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                    {loading && (
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
                        disabled={loading || !collection?.folder_path}
                    >
                        Create Venv
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => handleCreateOrRepairPythonEnv(true)}
                        disabled={loading || !collection?.folder_path}
                    >
                        Recreate Venv
                    </Button>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
