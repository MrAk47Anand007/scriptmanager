'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Cloud, Database, HardDrive, Plus, Pencil, Trash2, PlugZap } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    listStorageProviders,
    saveStorageProvider,
    deleteStorageProvider,
    testStorageProvider,
    type StorageProviderRecord,
} from '@/lib/storageRuntimeClient'
import type { ProviderType } from '@/lib/storage/types'

const PROVIDER_TYPES: { type: ProviderType; label: string; description: string; disabled?: boolean }[] = [
    { type: 's3', label: 'S3 / MinIO / compatible', description: 'Amazon S3 or any S3-compatible object store' },
    { type: 'gcs', label: 'Google Cloud Storage', description: 'GCS buckets via HMAC interoperability keys' },
    { type: 'webdav', label: 'WebDAV / Nextcloud', description: 'Any WebDAV server, including Nextcloud' },
    { type: 'gdrive', label: 'Google Drive', description: 'Sign in with your own Google OAuth Client ID (desktop connect)' },
    { type: 'onedrive', label: 'OneDrive', description: 'Sign in with your own Microsoft app Client ID (desktop connect)' },
]

const TYPE_LABELS: Record<ProviderType, string> = {
    s3: 'S3 compatible',
    gcs: 'Google Cloud Storage',
    webdav: 'WebDAV',
    gdrive: 'Google Drive',
    onedrive: 'OneDrive',
}

function providerIcon(type: ProviderType) {
    switch (type) {
        case 's3':
            return Database
        case 'gcs':
            return Cloud
        case 'webdav':
            return HardDrive
        default:
            return Cloud
    }
}

function providerSummary(record: StorageProviderRecord): string {
    const cfg = record.config
    if (record.type === 'webdav') {
        return typeof cfg.baseUrl === 'string' && cfg.baseUrl ? cfg.baseUrl : '—'
    }
    if (record.type === 'gdrive') {
        return typeof cfg.folderId === 'string' && cfg.folderId ? `folder: ${cfg.folderId}` : 'Drive root'
    }
    if (record.type === 'onedrive') {
        return typeof cfg.folderPath === 'string' && cfg.folderPath ? `/${cfg.folderPath}` : 'Drive root'
    }
    const parts: string[] = []
    if (typeof cfg.endpoint === 'string' && cfg.endpoint) parts.push(cfg.endpoint)
    if (typeof cfg.bucket === 'string' && cfg.bucket) parts.push(`bucket: ${cfg.bucket}`)
    if (typeof cfg.region === 'string' && cfg.region && parts.length < 2) parts.push(cfg.region)
    return parts.length ? parts.join(' · ') : '—'
}

type FormState = {
    id?: string
    type: ProviderType
    name: string
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
    baseUrl: string
    username: string
    password: string
    clientId: string
    refreshToken: string
    folderId: string
    folderPath: string
    fullAccess: boolean
}

const EMPTY_FORM: FormState = {
    type: 's3',
    name: '',
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    baseUrl: '',
    username: '',
    password: '',
    clientId: '',
    refreshToken: '',
    folderId: '',
    folderPath: '',
    fullAccess: false,
}

type TestState = { status: 'testing' } | { status: 'ok'; latencyMs?: number } | { status: 'error'; error: string }

export const CloudStorageSection = () => {
    const [providers, setProviders] = useState<StorageProviderRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState('')

    const [dialogOpen, setDialogOpen] = useState(false)
    const [dialogStep, setDialogStep] = useState<'type' | 'form'>('type')
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const [deleteTarget, setDeleteTarget] = useState<StorageProviderRecord | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [testStates, setTestStates] = useState<Record<string, TestState>>({})
    const [isConnecting, setIsConnecting] = useState(false)
    // Whether this build ships a default OAuth client (one-click connect, no
    // Client ID needed from the user).
    const [oauthDefaults, setOauthDefaults] = useState<{ gdrive: boolean; onedrive: boolean }>({ gdrive: false, onedrive: false })

    useEffect(() => {
        void window.scriptManagerDesktop?.oauthDefaults?.().then((defaults) => {
            if (defaults) setOauthDefaults(defaults)
        })
    }, [])

    const refresh = useCallback(async () => {
        try {
            const list = await listStorageProviders()
            setProviders(list)
            setLoadError('')
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load storage providers')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const openAddDialog = () => {
        setForm(EMPTY_FORM)
        setIsEditing(false)
        setDialogStep('type')
        setDialogOpen(true)
    }

    const openEditDialog = (record: StorageProviderRecord) => {
        const cfg = record.config
        setForm({
            id: record.id,
            type: record.type,
            name: record.name,
            endpoint: typeof cfg.endpoint === 'string' ? cfg.endpoint : '',
            region: typeof cfg.region === 'string' ? cfg.region : '',
            bucket: typeof cfg.bucket === 'string' ? cfg.bucket : '',
            accessKeyId: typeof cfg.accessKeyId === 'string' ? cfg.accessKeyId : '',
            secretAccessKey: typeof cfg.secretAccessKey === 'string' ? cfg.secretAccessKey : '',
            forcePathStyle: cfg.forcePathStyle === true,
            baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '',
            username: typeof cfg.username === 'string' ? cfg.username : '',
            password: typeof cfg.password === 'string' ? cfg.password : '',
            clientId: typeof cfg.clientId === 'string' ? cfg.clientId : '',
            refreshToken: typeof cfg.refreshToken === 'string' ? cfg.refreshToken : '',
            folderId: typeof cfg.folderId === 'string' ? cfg.folderId : '',
            folderPath: typeof cfg.folderPath === 'string' ? cfg.folderPath : '',
            fullAccess: false,
        })
        setIsEditing(true)
        setDialogStep('form')
        setDialogOpen(true)
    }

    const handlePickType = (type: ProviderType) => {
        setForm((prev) => ({ ...prev, type }))
        setDialogStep('form')
    }

    const handleSaveProvider = async () => {
        if (!form.name.trim()) {
            toast.error('Provider name is required')
            return
        }
        if (isOAuthType) {
            // The connect flow fills clientId (built-in default or user-supplied),
            // so a refresh token implies a usable client id.
            if (!form.refreshToken) {
                toast.error('Connect your account before saving')
                return
            }
        }
        const config: Record<string, unknown> = isOAuthType
            ? {
                  clientId: form.clientId.trim(),
                  refreshToken: form.refreshToken,
                  ...(form.type === 'gdrive' && form.folderId.trim() ? { folderId: form.folderId.trim() } : {}),
                  ...(form.type === 'onedrive' && form.folderPath.trim() ? { folderPath: form.folderPath.trim() } : {}),
              }
            : form.type === 'webdav'
                ? {
                      baseUrl: form.baseUrl,
                      username: form.username,
                      password: form.password,
                  }
                : {
                      ...(form.type === 's3' && form.endpoint ? { endpoint: form.endpoint } : {}),
                      region: form.region,
                      bucket: form.bucket,
                      accessKeyId: form.accessKeyId,
                      secretAccessKey: form.secretAccessKey,
                      ...(form.type === 's3' ? { forcePathStyle: form.forcePathStyle } : {}),
                  }

        setIsSaving(true)
        try {
            await saveStorageProvider({
                id: form.id,
                name: form.name.trim(),
                type: form.type,
                config,
            })
            await refresh()
            setDialogOpen(false)
            toast.success(isEditing ? 'Storage provider updated' : 'Storage provider added')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to save storage provider')
        } finally {
            setIsSaving(false)
        }
    }

    const handleTest = async (record: StorageProviderRecord) => {
        setTestStates((prev) => ({ ...prev, [record.id]: { status: 'testing' } }))
        try {
            const result = await testStorageProvider(record.id)
            if (result.ok) {
                setTestStates((prev) => ({ ...prev, [record.id]: { status: 'ok', latencyMs: result.latencyMs } }))
                toast.success(`Connection to "${record.name}" succeeded`)
            } else {
                setTestStates((prev) => ({ ...prev, [record.id]: { status: 'error', error: result.error ?? 'Connection failed' } }))
                toast.error(result.error ?? 'Connection failed')
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Connection failed'
            setTestStates((prev) => ({ ...prev, [record.id]: { status: 'error', error: message } }))
            toast.error(message)
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        try {
            await deleteStorageProvider(deleteTarget.id)
            await refresh()
            toast.success(`Deleted "${deleteTarget.name}"`)
            setDeleteTarget(null)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete storage provider')
        } finally {
            setIsDeleting(false)
        }
    }

    const isS3Like = form.type === 's3' || form.type === 'gcs'
    const isOAuthType = form.type === 'gdrive' || form.type === 'onedrive'
    const isDesktop = typeof window !== 'undefined' && !!window.scriptManagerDesktop?.oauthConnect
    const isConnected = form.refreshToken.length > 0

    const hasDefaultClient = form.type === 'gdrive' ? oauthDefaults.gdrive : form.type === 'onedrive' ? oauthDefaults.onedrive : false
    // '•••' is the masked placeholder on edit — treat it as "no override entered".
    const enteredClientId = form.clientId.trim().replace(/^•+$/, '')
    const canConnect = isDesktop && (hasDefaultClient || enteredClientId.length > 0)

    const handleOAuthConnect = async () => {
        const connect = window.scriptManagerDesktop?.oauthConnect
        if (!connect) {
            toast.error('Account connection is only available in the desktop app')
            return
        }
        if (!hasDefaultClient && !enteredClientId) {
            toast.error('This build has no built-in app credentials — enter a Client ID under Advanced')
            return
        }
        setIsConnecting(true)
        try {
            const result = await connect({
                provider: form.type as 'gdrive' | 'onedrive',
                ...(enteredClientId ? { clientId: enteredClientId } : {}),
                fullAccess: form.fullAccess,
            })
            if (result.ok && result.refreshToken) {
                setForm((prev) => ({
                    ...prev,
                    refreshToken: result.refreshToken as string,
                    // Persist the client the consent was granted to so token
                    // refreshes keep working (default or user-supplied).
                    clientId: result.clientIdUsed ?? prev.clientId,
                }))
                toast.success('Account connected')
            } else {
                toast.error(result.error ?? 'Connection failed')
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Connection failed')
        } finally {
            setIsConnecting(false)
        }
    }

    return (
        <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold">Cloud Storage</h2>
                    <p className="text-muted-foreground">
                        Connect remote storage providers to sync script collections across devices.
                    </p>
                </div>
                <Button onClick={openAddDialog} className="shrink-0 gap-2">
                    <Plus className="h-4 w-4" />
                    Add provider
                </Button>
            </div>

            {loadError && <p className="text-xs text-destructive">{loadError}</p>}

            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : providers.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                        <Cloud className="h-8 w-8 text-muted-foreground" />
                        <p className="font-medium">No storage providers yet</p>
                        <p className="text-xs text-muted-foreground">
                            Add an S3-compatible bucket or WebDAV server to start syncing collections.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {providers.map((record) => {
                        const Icon = providerIcon(record.type)
                        const test = testStates[record.id]
                        return (
                            <Card key={record.id}>
                                <CardContent className="flex items-center gap-4 py-4">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-wb-border bg-wb-sidepanel">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="truncate font-medium">{record.name}</p>
                                            {test && test.status !== 'testing' && (
                                                <span
                                                    className={cn(
                                                        'h-2 w-2 shrink-0 rounded-full',
                                                        test.status === 'ok' ? 'bg-success' : 'bg-destructive'
                                                    )}
                                                    title={test.status === 'ok'
                                                        ? `Connected${test.latencyMs != null ? ` (${test.latencyMs}ms)` : ''}`
                                                        : test.error}
                                                />
                                            )}
                                        </div>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {TYPE_LABELS[record.type]} · {providerSummary(record)}
                                        </p>
                                        {test?.status === 'error' && (
                                            <p className="truncate text-xs text-destructive">{test.error}</p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => handleTest(record)}
                                            disabled={test?.status === 'testing'}
                                        >
                                            {test?.status === 'testing'
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <PlugZap className="h-3.5 w-3.5" />}
                                            Test
                                        </Button>
                                        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEditDialog(record)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                            Edit
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteTarget(record)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Delete
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Add / Edit dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-lg">
                    {dialogStep === 'type' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Add storage provider</DialogTitle>
                                <DialogDescription>Choose the type of storage to connect.</DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-1 gap-2 py-2">
                                {PROVIDER_TYPES.map((option) => (
                                    <button
                                        key={option.type}
                                        type="button"
                                        disabled={option.disabled}
                                        onClick={() => handlePickType(option.type)}
                                        className={cn(
                                            'wb-transition flex items-center justify-between rounded-lg border border-wb-border p-3 text-left',
                                            option.disabled
                                                ? 'cursor-not-allowed opacity-50'
                                                : 'hover:border-accent-brand/50'
                                        )}
                                    >
                                        <div>
                                            <p className="font-medium">{option.label}</p>
                                            {!option.disabled && (
                                                <p className="text-xs text-muted-foreground">{option.description}</p>
                                            )}
                                        </div>
                                        {option.disabled && (
                                            <span className="rounded-full border border-wb-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                                Coming soon
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {isEditing ? `Edit ${form.name || 'provider'}` : `New ${TYPE_LABELS[form.type]} provider`}
                                </DialogTitle>
                                <DialogDescription>
                                    {isOAuthType
                                        ? 'Use your own OAuth Client ID — tokens are stored encrypted on this machine.'
                                        : form.type === 'webdav'
                                          ? 'Credentials are stored encrypted on this machine.'
                                          : 'Access keys are stored encrypted on this machine.'}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="provider_name">Name</Label>
                                    <Input
                                        id="provider_name"
                                        placeholder="My storage"
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    />
                                </div>

                                {isS3Like && (
                                    <>
                                        {form.type === 's3' && (
                                            <div className="space-y-2">
                                                <Label htmlFor="provider_endpoint">Endpoint</Label>
                                                <Input
                                                    id="provider_endpoint"
                                                    placeholder="https://s3.example.com (leave blank for AWS)"
                                                    value={form.endpoint}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                                                />
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_region">Region</Label>
                                            <Input
                                                id="provider_region"
                                                placeholder="us-east-1"
                                                value={form.region}
                                                onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_bucket">Bucket</Label>
                                            <Input
                                                id="provider_bucket"
                                                placeholder="my-bucket"
                                                value={form.bucket}
                                                onChange={(e) => setForm((prev) => ({ ...prev, bucket: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_access_key">Access Key ID</Label>
                                            <Input
                                                id="provider_access_key"
                                                value={form.accessKeyId}
                                                onChange={(e) => setForm((prev) => ({ ...prev, accessKeyId: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_secret_key">Secret Access Key</Label>
                                            <Input
                                                id="provider_secret_key"
                                                type="password"
                                                value={form.secretAccessKey}
                                                onChange={(e) => setForm((prev) => ({ ...prev, secretAccessKey: e.target.value }))}
                                            />
                                            {isEditing && (
                                                <p className="text-xs text-muted-foreground">
                                                    Leave as &bull;&bull;&bull; to keep the existing secret.
                                                </p>
                                            )}
                                        </div>
                                        {form.type === 's3' && (
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="provider_force_path_style"
                                                    checked={form.forcePathStyle}
                                                    onCheckedChange={(checked) =>
                                                        setForm((prev) => ({ ...prev, forcePathStyle: checked === true }))
                                                    }
                                                />
                                                <Label htmlFor="provider_force_path_style" className="font-normal">
                                                    Force path-style addressing (required for MinIO)
                                                </Label>
                                            </div>
                                        )}
                                    </>
                                )}

                                {form.type === 'webdav' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_base_url">Base URL</Label>
                                            <Input
                                                id="provider_base_url"
                                                placeholder="https://cloud.example.com/remote.php/dav/files/user"
                                                value={form.baseUrl}
                                                onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_username">Username</Label>
                                            <Input
                                                id="provider_username"
                                                value={form.username}
                                                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_password">Password</Label>
                                            <Input
                                                id="provider_password"
                                                type="password"
                                                value={form.password}
                                                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                            />
                                            {isEditing && (
                                                <p className="text-xs text-muted-foreground">
                                                    Leave as &bull;&bull;&bull; to keep the existing password.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}

                                {isOAuthType && (
                                    <>
                                        {/* One-click connect — opens the browser, account picker, consent. */}
                                        <div className="space-y-2 rounded-md border border-wb-border bg-card p-3">
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    type="button"
                                                    variant={isConnected ? 'outline' : 'default'}
                                                    className="gap-1.5"
                                                    onClick={handleOAuthConnect}
                                                    disabled={!canConnect || isConnecting}
                                                >
                                                    {isConnecting
                                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        : <PlugZap className="h-3.5 w-3.5" />}
                                                    {isConnecting
                                                        ? 'Waiting for browser…'
                                                        : isConnected ? 'Reconnect account' : `Connect ${form.type === 'gdrive' ? 'Google' : 'Microsoft'} account`}
                                                </Button>
                                                {isConnected && (
                                                    <span className="text-xs text-success">Connected ✓</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {!isDesktop
                                                    ? 'Account connection requires the desktop app.'
                                                    : isConnecting
                                                        ? 'Pick your account and grant access in the browser window that just opened.'
                                                        : 'Opens your browser to pick an account and grant access.'}
                                            </p>
                                            <label className="flex cursor-pointer items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="accent-[hsl(var(--accent-brand))]"
                                                    checked={form.fullAccess}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, fullAccess: e.target.checked }))}
                                                    disabled={isConnecting}
                                                />
                                                <span>
                                                    Full {form.type === 'gdrive' ? 'Drive' : 'OneDrive'} access
                                                    <span className="text-muted-foreground"> — see all files, not just ones this app creates (reconnect after changing)</span>
                                                </span>
                                            </label>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="provider_oauth_folder">
                                                {form.type === 'gdrive' ? 'Folder ID (optional)' : 'Folder path (optional)'}
                                            </Label>
                                            <Input
                                                id="provider_oauth_folder"
                                                placeholder={form.type === 'gdrive'
                                                    ? 'Drive folder ID (blank = My Drive root)'
                                                    : 'ScriptManager (blank = OneDrive root)'}
                                                value={form.type === 'gdrive' ? form.folderId : form.folderPath}
                                                onChange={(e) =>
                                                    setForm((prev) =>
                                                        form.type === 'gdrive'
                                                            ? { ...prev, folderId: e.target.value }
                                                            : { ...prev, folderPath: e.target.value }
                                                    )
                                                }
                                            />
                                        </div>
                                        <details className="rounded-md border border-wb-border p-3" open={!hasDefaultClient}>
                                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                                                Advanced — use your own OAuth app
                                            </summary>
                                            <div className="mt-3 space-y-2">
                                                <Label htmlFor="provider_client_id">OAuth Client ID</Label>
                                                <Input
                                                    id="provider_client_id"
                                                    placeholder={form.type === 'gdrive'
                                                        ? 'xxxx.apps.googleusercontent.com'
                                                        : 'Application (client) ID from Azure portal'}
                                                    value={form.clientId}
                                                    onChange={(e) => setForm((prev) => ({ ...prev, clientId: e.target.value }))}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    {hasDefaultClient
                                                        ? 'Leave blank to use the built-in app credentials.'
                                                        : form.type === 'gdrive'
                                                            ? 'This build has no built-in Google credentials. Create a "Desktop app" OAuth client in Google Cloud Console (Drive API enabled) and paste its ID here, or set GDRIVE_CLIENT_ID in electron/oauthDefaults.ts.'
                                                            : 'This build has no built-in Microsoft credentials. Register an app in Microsoft Entra ("Mobile and desktop applications" + http://127.0.0.1 redirect) and paste its ID here, or set ONEDRIVE_CLIENT_ID in electron/oauthDefaults.ts.'}
                                                </p>
                                            </div>
                                        </details>
                                    </>
                                )}
                            </div>
                            <DialogFooter>
                                {!isEditing && (
                                    <Button variant="ghost" onClick={() => setDialogStep('type')} disabled={isSaving}>
                                        Back
                                    </Button>
                                )}
                                <Button onClick={handleSaveProvider} disabled={isSaving}>
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {isEditing ? 'Save changes' : 'Add provider'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete confirmation */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</DialogTitle>
                        <DialogDescription>
                            This removes the provider and unbinds any collections currently synced to it. Remote files are not deleted.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete provider
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    )
}
