'use client'

import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchSettings, saveSettings } from '@/features/settings/settingsSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Github, FolderIcon, Download, Upload, Package } from 'lucide-react';
import { useRef } from 'react';
import axios from 'axios';
import { useAppDispatch as _useAppDispatch } from '@/store/hooks';

export const SettingsManager = () => {
    const dispatch = useAppDispatch();
    const { settings, status, error } = useAppSelector((state) => state.settings);

    const [githubToken, setGithubToken] = useState('');
    const [gistSyncEnabled, setGistSyncEnabled] = useState(false);
    const [scriptPath, setScriptPath] = useState('');
    const [executionTimeoutSecs, setExecutionTimeoutSecs] = useState('30');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    // Import/Export state
    const [importStatus, setImportStatus] = useState<string>('');
    const [importError, setImportError] = useState<string>('');
    const importFileRef = useRef<HTMLInputElement>(null);

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImportStatus('')
        setImportError('')
        try {
            const text = await file.text()
            const json = JSON.parse(text)
            const res = await axios.post('/api/scripts/import', json)
            setImportStatus(res.data.message ?? 'Import successful')
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } }
            setImportError(axiosErr.response?.data?.error ?? 'Import failed — check file format')
        } finally {
            if (importFileRef.current) importFileRef.current.value = ''
        }
    };

    useEffect(() => {
        if (status === 'idle') {
            dispatch(fetchSettings());
        }
    }, [status, dispatch]);

    useEffect(() => {
        if (status === 'succeeded') {
            setGithubToken(settings['github_token'] || '');
            setGistSyncEnabled(settings['gist_sync_enabled'] === 'true');
            setScriptPath(settings['script_storage_path'] || '');
            const timeoutMs = settings['execution_timeout_ms']
            setExecutionTimeoutSecs(timeoutMs ? String(parseInt(timeoutMs, 10) / 1000) : '30');
        }
    }, [settings, status]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage('');
        try {
            const timeoutMs = executionTimeoutSecs.trim()
                ? String(Math.round(parseFloat(executionTimeoutSecs) * 1000))
                : '30000';
            await dispatch(saveSettings({
                'github_token': githubToken,
                'gist_sync_enabled': String(gistSyncEnabled),
                'script_storage_path': scriptPath,
                'execution_timeout_ms': timeoutMs,
            })).unwrap();
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    if (status === 'loading' && Object.keys(settings).length === 0) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <SettingsIcon className="h-6 w-6 text-slate-500" />
                Settings
            </h2>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {saveMessage && (
                <Alert className="bg-green-50 text-green-800 border-green-200">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{saveMessage}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FolderIcon className="h-5 w-5" /> Local Storage</CardTitle>
                    <CardDescription>
                        Configure where scripts are stored on the server.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="script_path">Script Directory Path</Label>
                        <Input
                            id="script_path"
                            placeholder="./user_scripts"
                            value={scriptPath}
                            onChange={(e) => setScriptPath(e.target.value)}
                        />
                        <p className="text-xs text-slate-500">
                            Absolute path or relative to the application root.
                            <br />
                            <span className="text-amber-600 font-medium">Warning:</span> Changing this will not move existing scripts.
                        </p>
                    </div>
                    <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="execution_timeout">Default Execution Timeout (seconds)</Label>
                        <Input
                            id="execution_timeout"
                            type="number"
                            min="1"
                            placeholder="30"
                            value={executionTimeoutSecs}
                            onChange={(e) => setExecutionTimeoutSecs(e.target.value)}
                            className="w-32"
                        />
                        <p className="text-xs text-slate-500">
                            Scripts that run longer than this will be killed. Per-script overrides take precedence. Default: 30s.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Github className="h-5 w-5" /> GitHub Integration</CardTitle>
                    <CardDescription>
                        Configure your GitHub Personal Access Token to enable Gist synchronization for scripts.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="github_token">Personal Access Token (Classic)</Label>
                        <Input
                            id="github_token"
                            type="password"
                            placeholder="ghp_..."
                            value={githubToken}
                            onChange={(e) => setGithubToken(e.target.value)}
                        />
                        <p className="text-xs text-slate-500">
                            Required scope: <code>gist</code>. Generate at{' '}
                            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
                                github.com/settings/tokens
                            </a>
                        </p>
                    </div>

                    <div className="flex items-center justify-between space-x-2 border-t pt-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="gist_sync_enabled">Sync New Scripts by Default</Label>
                            <p className="text-xs text-slate-500">
                                Automatically enable Gist syncing for newly created scripts.
                            </p>
                        </div>
                        <Switch
                            id="gist_sync_enabled"
                            checked={gistSyncEnabled}
                            onCheckedChange={setGistSyncEnabled}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Import &amp; Export</CardTitle>
                    <CardDescription>
                        Export all scripts to a JSON file for backup or transfer. Import scripts from a previously exported file.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => window.open('/api/export', '_blank')}
                        >
                            <Download className="h-4 w-4" />
                            Export All Scripts
                        </Button>
                        <span className="text-xs text-slate-500">Downloads a JSON file with all scripts and metadata</span>
                    </div>
                    <div className="border-t pt-4 space-y-2">
                        <Label className="text-sm font-medium">Import Scripts</Label>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                className="gap-2"
                                onClick={() => importFileRef.current?.click()}
                            >
                                <Upload className="h-4 w-4" />
                                Choose JSON File
                            </Button>
                            <input
                                ref={importFileRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={handleImportFile}
                            />
                            <span className="text-xs text-slate-500">Duplicate scripts (same name) are skipped</span>
                        </div>
                        {importStatus && (
                            <p className="text-xs text-green-600 font-medium">{importStatus}</p>
                        )}
                        {importError && (
                            <p className="text-xs text-red-500">{importError}</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Settings
                </Button>
            </div>
        </div>
    );
};

const SettingsIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.39a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);
