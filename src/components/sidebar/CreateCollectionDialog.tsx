'use client'

import { useState, useEffect } from 'react';
import type { Collection } from '@/features/scripts/scriptsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export const RUNTIME_OPTIONS: Array<{ value: NonNullable<Collection['runtime_preset']>; label: string }> = [
    { value: 'general', label: 'General' },
    { value: 'python', label: 'Python' },
    { value: 'node', label: 'JavaScript / Node' },
    { value: 'shell', label: 'Shell' },
    { value: 'powershell', label: 'PowerShell' },
]

export interface CreateCollectionDialogProps {
    open: boolean;
    /** Whether the desktop runtime folder picker is available (shows runtime/Python options). */
    hasDesktopFolderPicker: boolean;
    /** True while the sidebar is dispatching the create-collection thunk. */
    submitting: boolean;
    onCancel: () => void;
    onCreate: (values: {
        name: string;
        runtimePreset: NonNullable<Collection['runtime_preset']>;
        pythonTools: boolean;
    }) => Promise<void>;
}

export function CreateCollectionDialog({
    open,
    hasDesktopFolderPicker,
    submitting,
    onCancel,
    onCreate,
}: CreateCollectionDialogProps) {
    const [newCollectionName, setNewCollectionName] = useState('');
    const [newCollectionRuntimePreset, setNewCollectionRuntimePreset] = useState<NonNullable<Collection['runtime_preset']>>('general');
    const [newCollectionPythonTools, setNewCollectionPythonTools] = useState(false);

    // Reset form state each time the panel opens
    useEffect(() => {
        if (open) {
            setNewCollectionName('');
            setNewCollectionRuntimePreset('general');
            setNewCollectionPythonTools(false);
        }
    }, [open]);

    useEffect(() => {
        if (newCollectionRuntimePreset === 'python') {
            setNewCollectionPythonTools(true);
        }
    }, [newCollectionRuntimePreset]);

    const handleCreateCollection = async () => {
        if (!newCollectionName.trim() || submitting) return;
        await onCreate({
            name: newCollectionName,
            runtimePreset: newCollectionRuntimePreset,
            pythonTools: newCollectionPythonTools,
        });
    };

    if (!open) return null;

    return (
        <div className="p-2 border-b bg-blue-50 dark:bg-blue-900/20 dark:border-slate-800">
            <Input
                autoFocus
                placeholder="Collection Name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
                className="h-7 text-xs mb-2 bg-white dark:bg-slate-950 dark:border-slate-700"
                disabled={submitting}
            />
            {hasDesktopFolderPicker && (
                <>
                    <Select
                        value={newCollectionRuntimePreset}
                        onValueChange={(value: NonNullable<Collection['runtime_preset']>) => setNewCollectionRuntimePreset(value)}
                        disabled={submitting}
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
                            disabled={newCollectionRuntimePreset === 'python' || submitting}
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
                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleCreateCollection} disabled={submitting || !newCollectionName.trim()}>
                    {submitting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                    {submitting ? 'Creating...' : 'Create'}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={onCancel} disabled={submitting}>Cancel</Button>
            </div>
        </div>
    );
}
