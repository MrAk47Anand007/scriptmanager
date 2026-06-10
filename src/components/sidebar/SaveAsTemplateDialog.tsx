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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LayoutTemplate } from 'lucide-react';
import type { Script } from '@/features/scripts/scriptsSlice';

export interface SaveAsTemplateDialogProps {
    open: boolean;
    /** The script being saved as a template. */
    sourceScript: Script | null;
    /** True while the sidebar is dispatching the save-as-template thunk. */
    submitting: boolean;
    onOpenChange: (open: boolean) => void;
    /** Returns an error message to display, or null on success (the sidebar closes the dialog). */
    onSubmit: (values: { name: string; description: string; category: string }) => Promise<string | null>;
}

export function SaveAsTemplateDialog({
    open,
    sourceScript,
    submitting,
    onOpenChange,
    onSubmit,
}: SaveAsTemplateDialogProps) {
    const [templateName, setTemplateName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('general');
    const [error, setError] = useState('');

    // Reset the form from the source script each time the dialog opens
    useEffect(() => {
        if (open) {
            setTemplateName(sourceScript?.name ?? '');
            setDescription('');
            setCategory('general');
            setError('');
        }
    }, [open, sourceScript]);

    const handleSubmit = async () => {
        if (!templateName.trim() || submitting) return;
        setError('');
        const submitError = await onSubmit({
            name: templateName.trim(),
            description: description.trim(),
            category,
        });
        if (submitError) {
            setError(submitError);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LayoutTemplate className="h-4 w-4 text-blue-500" />
                        Save as Template
                    </DialogTitle>
                    <DialogDescription>
                        Save &quot;{sourceScript?.name}&quot; as a reusable template.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="tpl-name" className="text-xs">Template Name</Label>
                        <Input
                            id="tpl-name"
                            placeholder="My Template"
                            value={templateName}
                            onChange={(e) => {
                                setTemplateName(e.target.value)
                                if (error) setError('')
                            }}
                            autoFocus
                            className="h-8 text-xs"
                        />
                        {error && (
                            <p className="text-[10px] text-red-500">{error}</p>
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="tpl-desc" className="text-xs">Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                            id="tpl-desc"
                            placeholder="What does this template do?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="tpl-category" className="text-xs">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
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
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        className="text-xs"
                        onClick={handleSubmit}
                        disabled={!templateName.trim() || submitting}
                    >
                        {submitting ? 'Saving…' : 'Save Template'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
