'use client'

import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { fetchCollections, fetchScripts } from '@/features/scripts/scriptsSlice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Folder, Loader2, ScanSearch, X } from 'lucide-react';

type ScannedFile = {
    path: string
    name: string
    ext: string
    sizeBytes: number
    modifiedAt: string
}

type ScanResult = {
    files: ScannedFile[]
    truncated: boolean
    scannedDirs: number
}

type Step = 'options' | 'scanning' | 'results'

const EXTENSION_OPTIONS = [
    { ext: '.py', label: 'Python (.py)' },
    { ext: '.js', label: 'JavaScript (.js)' },
    { ext: '.sh', label: 'Shell (.sh)' },
    { ext: '.ps1', label: 'PowerShell (.ps1)' },
] as const;

const MAX_DISPLAYED_FILES = 500;

function parentDir(filePath: string): string {
    const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
    return idx > 0 ? filePath.slice(0, idx) : filePath;
}

export interface ScanPcDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ScanPcDialog({ open, onOpenChange }: ScanPcDialogProps) {
    const dispatch = useAppDispatch();
    const [step, setStep] = useState<Step>('options');
    const [roots, setRoots] = useState<string[]>([]);
    const [extensions, setExtensions] = useState<string[]>(EXTENSION_OPTIONS.map((option) => option.ext));
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [importMode, setImportMode] = useState<'misc' | 'by-folder'>('misc');
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setStep('options');
            setScanResult(null);
            setSelectedPaths(new Set());
            setImportMode('misc');
            setIsImporting(false);
            setError('');
        }
    }, [open]);

    const groupedFiles = useMemo(() => {
        if (!scanResult) return [];
        const groups = new Map<string, ScannedFile[]>();
        for (const file of scanResult.files.slice(0, MAX_DISPLAYED_FILES)) {
            const dir = parentDir(file.path);
            const list = groups.get(dir) ?? [];
            list.push(file);
            groups.set(dir, list);
        }
        return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
    }, [scanResult]);

    const hiddenCount = scanResult ? Math.max(0, scanResult.files.length - MAX_DISPLAYED_FILES) : 0;

    const addFolder = async () => {
        setError('');
        const selected = await window.scriptManagerDesktop?.selectFolder?.();
        if (selected && !roots.includes(selected)) {
            setRoots((prev) => [...prev, selected]);
        }
    };

    const toggleExtension = (ext: string, checked: boolean) => {
        setExtensions((prev) => checked ? Array.from(new Set([...prev, ext])) : prev.filter((entry) => entry !== ext));
    };

    const runScan = async () => {
        const scan = window.scriptManagerDesktop?.runtime?.scanPcScripts;
        if (!scan || roots.length === 0 || extensions.length === 0) return;

        setError('');
        setStep('scanning');
        try {
            const result = await scan({ roots, extensions });
            setScanResult(result);
            setSelectedPaths(new Set(result.files.map((file) => file.path)));
            setStep('results');
        } catch (scanError) {
            setError(scanError instanceof Error ? scanError.message : 'Scan failed');
            setStep('options');
        }
    };

    const togglePath = (path: string, checked: boolean) => {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            if (checked) next.add(path); else next.delete(path);
            return next;
        });
    };

    const toggleGroup = (files: ScannedFile[], checked: boolean) => {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            for (const file of files) {
                if (checked) next.add(file.path); else next.delete(file.path);
            }
            return next;
        });
    };

    const handleImport = async () => {
        const importScanned = window.scriptManagerDesktop?.runtime?.importScannedScripts;
        if (!importScanned || selectedPaths.size === 0 || isImporting) return;

        setIsImporting(true);
        setError('');
        try {
            const result = await importScanned({
                files: Array.from(selectedPaths).map((path) => ({ path })),
                mode: importMode,
                rootForGrouping: importMode === 'by-folder' ? roots[0] : undefined,
            });
            toast.success(`Imported ${result.imported} script${result.imported === 1 ? '' : 's'}${result.skipped > 0 ? `, skipped ${result.skipped} already linked` : ''}`);
            await Promise.all([dispatch(fetchScripts()), dispatch(fetchCollections())]);
            onOpenChange(false);
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : 'Import failed');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => !isImporting && step !== 'scanning' && onOpenChange(nextOpen)}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ScanSearch className="h-4 w-4 text-blue-500" />
                        Find scripts on this PC
                    </DialogTitle>
                    <DialogDescription>
                        Scan folders for script files and link them into collections. Dependency and system folders are skipped automatically.
                    </DialogDescription>
                </DialogHeader>

                {step === 'options' && (
                    <div className="flex flex-col gap-4 py-2 text-[13px]">
                        <div className="flex flex-col gap-2">
                            <Label>Folders to scan</Label>
                            {roots.length === 0 && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    No folders selected yet — try your home folder or a projects directory.
                                </p>
                            )}
                            {roots.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {roots.map((root) => (
                                        <span
                                            key={root}
                                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                        >
                                            <Folder className="h-3 w-3 shrink-0 text-blue-500" />
                                            <span className="truncate" title={root}>{root}</span>
                                            <button
                                                type="button"
                                                className="ml-0.5 rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
                                                onClick={() => setRoots((prev) => prev.filter((entry) => entry !== root))}
                                                aria-label={`Remove ${root}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div>
                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addFolder}>
                                    <Folder className="mr-1.5 h-3.5 w-3.5" /> Add folder
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label>Script types</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {EXTENSION_OPTIONS.map((option) => (
                                    <div key={option.ext} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`scan-ext-${option.ext}`}
                                            checked={extensions.includes(option.ext)}
                                            onCheckedChange={(checked) => toggleExtension(option.ext, Boolean(checked))}
                                        />
                                        <Label htmlFor={`scan-ext-${option.ext}`} className="text-[13px] font-normal">
                                            {option.label}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {error && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {step === 'scanning' && (
                    <div className="flex flex-col items-center gap-3 py-10 text-[13px] text-slate-600 dark:text-slate-300">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <span>Scanning… this can take a minute</span>
                    </div>
                )}

                {step === 'results' && scanResult && (
                    <div className="flex flex-col gap-3 py-2 text-[13px]">
                        <div className="text-slate-600 dark:text-slate-300">
                            Found {scanResult.files.length} script{scanResult.files.length === 1 ? '' : 's'} in {groupedFiles.length} folder{groupedFiles.length === 1 ? '' : 's'}
                            {scanResult.truncated && (
                                <span className="ml-1 text-amber-600 dark:text-amber-400">
                                    (stopped early — refine your folders to see everything)
                                </span>
                            )}
                        </div>

                        <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                            {groupedFiles.map(([dir, files]) => {
                                const allChecked = files.every((file) => selectedPaths.has(file.path));
                                return (
                                    <div key={dir} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                                        <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 dark:bg-slate-900">
                                            <Checkbox
                                                checked={allChecked}
                                                onCheckedChange={(checked) => toggleGroup(files, Boolean(checked))}
                                            />
                                            <span className="truncate font-medium text-slate-700 dark:text-slate-200" title={dir}>{dir}</span>
                                            <span className="ml-auto shrink-0 text-xs text-slate-400">{files.length}</span>
                                        </div>
                                        {files.map((file) => (
                                            <div key={file.path} className="flex items-center gap-2 px-2 py-1 pl-7">
                                                <Checkbox
                                                    checked={selectedPaths.has(file.path)}
                                                    onCheckedChange={(checked) => togglePath(file.path, Boolean(checked))}
                                                />
                                                <span className="truncate text-slate-600 dark:text-slate-300" title={file.path}>{file.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                        {hiddenCount > 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {hiddenCount} more file{hiddenCount === 1 ? '' : 's'} not shown — they are still selected for import.
                            </p>
                        )}

                        <div className="flex flex-col gap-1.5">
                            <Label>Import into</Label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="scan-import-mode"
                                    checked={importMode === 'misc'}
                                    onChange={() => setImportMode('misc')}
                                    className="h-3.5 w-3.5 accent-blue-600"
                                />
                                <span>One &quot;Miscellaneous&quot; collection</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="scan-import-mode"
                                    checked={importMode === 'by-folder'}
                                    onChange={() => setImportMode('by-folder')}
                                    className="h-3.5 w-3.5 accent-blue-600"
                                />
                                <span>One collection per top-level folder</span>
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Scripts are linked in place — files stay where they are. You can move them between collections later.
                            </p>
                        </div>

                        {error && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isImporting || step === 'scanning'}>
                        Cancel
                    </Button>
                    {step === 'options' && (
                        <Button onClick={runScan} disabled={roots.length === 0 || extensions.length === 0}>
                            Scan
                        </Button>
                    )}
                    {step === 'results' && (
                        <Button onClick={handleImport} disabled={selectedPaths.size === 0 || isImporting}>
                            {isImporting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                `Import ${selectedPaths.size} script${selectedPaths.size === 1 ? '' : 's'}`
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
