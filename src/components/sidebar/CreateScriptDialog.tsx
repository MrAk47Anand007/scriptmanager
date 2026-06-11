'use client'

import { useState, useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';

export interface CreateScriptDialogProps {
    open: boolean;
    parentCollectionId: string | null;
    /** Whether the target collection is linked to a local folder (affects the helper text). */
    parentHasFolderPath: boolean;
    /** Initial value for the "Sync to GitHub Gist" checkbox each time the dialog opens. */
    defaultSyncToGist: boolean;
    /** True while the sidebar is dispatching the create-script thunk. */
    submitting: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (values: {
        name: string;
        description: string;
        collectionId: string | null;
        syncToGist: boolean;
    }) => Promise<void>;
}

export function CreateScriptDialog({
    open,
    parentCollectionId,
    parentHasFolderPath,
    defaultSyncToGist,
    submitting,
    onOpenChange,
    onCreate,
}: CreateScriptDialogProps) {
    const [newScriptName, setNewScriptName] = useState('');
    const [newScriptDescription, setNewScriptDescription] = useState('');
    const [syncToGistOverride, setSyncToGistOverride] = useState(false);

    // Initialize sync override based on global setting when opening dialog
    useEffect(() => {
        if (open) {
            setSyncToGistOverride(defaultSyncToGist);
            setNewScriptName('');
            setNewScriptDescription('');
        }
    }, [open, defaultSyncToGist]);

    const handleCreateScriptSubmit = async () => {
        if (!newScriptName.trim() || submitting) return;
        await onCreate({
            name: newScriptName,
            description: newScriptDescription,
            collectionId: parentCollectionId,
            syncToGist: syncToGistOverride,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New Script</DialogTitle>
                    <DialogDescription>
                        {parentHasFolderPath
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
                            disabled={submitting}
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
                            disabled={submitting}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateScriptSubmit()}
                        />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="syncToGist"
                            checked={syncToGistOverride}
                            onCheckedChange={(checked) => setSyncToGistOverride(!!checked)}
                            disabled={submitting}
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
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleCreateScriptSubmit} disabled={!newScriptName.trim() || submitting}>
                        {submitting ? (
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
    );
}
