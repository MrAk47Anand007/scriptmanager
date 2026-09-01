

import React, { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { saveSettings } from '@/features/settings/settingsSlice'
import { fetchCollections, fetchScripts } from '@/features/scripts/scriptsSlice'
import { selectSettings, selectSettingsStatus } from '@/features/settings/selectors'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, FolderIcon, Download, Upload, Package } from 'lucide-react'
import { exportScriptsRuntime, importScriptsRuntime } from '@/lib/scriptsRuntimeClient'

export const GeneralSection = () => {
    const dispatch = useAppDispatch()
    const settings = useAppSelector(selectSettings)
    const status = useAppSelector(selectSettingsStatus)

    const [scriptPath, setScriptPath] = useState('')
    const [executionTimeoutSecs, setExecutionTimeoutSecs] = useState('30')
    const [isSaving, setIsSaving] = useState(false)

    // Import/Export state
    const [importStatus, setImportStatus] = useState<string>('')
    const [importError, setImportError] = useState<string>('')
    const importFileRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (status === 'succeeded') {
            setScriptPath(settings['script_storage_path'] || '')
            const timeoutMs = settings['execution_timeout_ms']
            setExecutionTimeoutSecs(timeoutMs ? String(parseInt(timeoutMs, 10) / 1000) : '30')
        }
    }, [settings, status])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const timeoutMs = executionTimeoutSecs.trim()
                ? String(Math.round(parseFloat(executionTimeoutSecs) * 1000))
                : '30000'
            await dispatch(saveSettings({
                'script_storage_path': scriptPath,
                'execution_timeout_ms': timeoutMs,
            })).unwrap()
            toast.success('Settings saved')
        } catch (err) {
            console.error(err)
            toast.error('Failed to save settings')
        } finally {
            setIsSaving(false)
        }
    }

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImportStatus('')
        setImportError('')
        try {
            const text = await file.text()
            const json = JSON.parse(text)
            const result = await importScriptsRuntime(json)
            await Promise.all([dispatch(fetchScripts()), dispatch(fetchCollections())])
            setImportStatus(result.message ?? 'Import successful')
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } }
            setImportError(axiosErr.response?.data?.error ?? (err instanceof Error ? err.message : 'Import failed — check file format'))
        } finally {
            if (importFileRef.current) importFileRef.current.value = ''
        }
    }

    const handleExport = async () => {
        try {
            const bundle = await exportScriptsRuntime()
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = 'scriptmanager-export.json'
            anchor.click()
            URL.revokeObjectURL(url)
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Export failed')
        }
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">General</h2>
                <p className="text-muted-foreground">Workspace storage, execution defaults, and data import/export.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><FolderIcon className="h-5 w-5" /> Local Storage</CardTitle>
                    <CardDescription>
                        Configure the local workspace root. ScriptManager will create separate <code>Scripts</code> and <code>APIs</code> folders inside it.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="script_path">Workspace Root Path</Label>
                        <Input
                            id="script_path"
                            placeholder="./user_scripts"
                            value={scriptPath}
                            onChange={(e) => setScriptPath(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Absolute path or relative to the application root.
                            <br />
                            Managed script collections will live in <code>Scripts</code> and managed API collections will live in <code>APIs</code>.
                            <br />
                            <span className="text-warning font-medium">Warning:</span> Changing this will not move existing data automatically.
                        </p>
                    </div>
                    <div className="space-y-2 border-t border-wb-border pt-4">
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
                        <p className="text-xs text-muted-foreground">
                            Scripts that run longer than this will be killed. Per-script overrides take precedence. Default: 30s.
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Settings
                        </Button>
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
                            onClick={() => void handleExport()}
                        >
                            <Download className="h-4 w-4" />
                            Export All Scripts
                        </Button>
                        <span className="text-xs text-muted-foreground">Downloads a JSON file with all scripts and metadata</span>
                    </div>
                    <div className="border-t border-wb-border pt-4 space-y-2">
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
                            <span className="text-xs text-muted-foreground">Duplicate scripts (same name) are skipped</span>
                        </div>
                        {importStatus && (
                            <p className="text-xs text-success font-medium">{importStatus}</p>
                        )}
                        {importError && (
                            <p className="text-xs text-destructive">{importError}</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
