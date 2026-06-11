'use client'

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Collection } from '@/features/scripts/scriptsSlice';

export interface DeleteCollectionDialogProps {
    /** The collection pending deletion; the dialog is open while this is set. */
    collection: Collection | null;
    /** True while the sidebar is dispatching the delete/remove thunk. */
    deleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void>;
}

export function DeleteCollectionDialog({
    collection,
    deleting,
    onOpenChange,
    onConfirm,
}: DeleteCollectionDialogProps) {
    const isDeleteTemporaryWorkspace = Boolean(collection?.is_temporary);
    const hasCollectionFolder = Boolean(collection?.folder_path && !collection?.is_temporary);

    return (
        <Dialog open={!!collection} onOpenChange={(open) => !deleting && !open && onOpenChange(open)}>
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
                                    {collection?.name}
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
                        {deleting && (
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
                            onClick={() => onOpenChange(false)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="min-w-36 bg-red-500 text-white hover:bg-red-400"
                            onClick={onConfirm}
                            disabled={deleting}
                        >
                            {deleting ? (
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
    );
}
