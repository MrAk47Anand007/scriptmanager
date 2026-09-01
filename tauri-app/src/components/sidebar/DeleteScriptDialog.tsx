

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
import { Loader2, Trash2 } from 'lucide-react';
import type { Script } from '@/features/scripts/scriptsSlice';

export interface DeleteScriptDialogProps {
    open: boolean;
    script: Script | null;
    /** True while the sidebar is dispatching the delete-script thunk. */
    deleting: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (opts: { deleteFromGist: boolean }) => Promise<void>;
}

export function DeleteScriptDialog({
    open,
    script,
    deleting,
    onOpenChange,
    onConfirm,
}: DeleteScriptDialogProps) {
    const [deleteFromGist, setDeleteFromGist] = useState(false);

    // Default the gist checkbox from the target script each time the dialog opens
    useEffect(() => {
        if (open) {
            setDeleteFromGist(Boolean(script?.sync_to_gist || script?.gist_id));
        }
    }, [open, script]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                        <Trash2 className="h-5 w-5" />
                        Delete Script
                    </DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete <span className="font-semibold text-slate-900 dark:text-slate-100">{script?.name}</span>? This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>

                {script?.gist_id && (
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
                        onClick={() => onOpenChange(false)}
                        disabled={deleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => onConfirm({ deleteFromGist })}
                        disabled={deleting}
                    >
                        {deleting ? (
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
    );
}
