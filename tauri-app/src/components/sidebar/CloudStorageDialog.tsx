
import { useEffect, useState } from 'react'
import { useAppDispatch } from '@/store/hooks'
import type { Collection } from '@/features/scripts/scriptsSlice'
import { fetchCollections, fetchScripts, updateCollectionCloudBinding } from '@/features/scripts/scriptsSlice'
import { listStorageProviders, syncCollectionRemote, type StorageProviderRecord } from '@/lib/storageRuntimeClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Cloud, Loader2, RefreshCw } from 'lucide-react'

const NOT_CONNECTED = '__none__'

export function CloudStorageDialog({
    collection,
    onOpenChange,
}: {
    collection: Collection | null
    onOpenChange: (open: boolean) => void
}) {
    const dispatch = useAppDispatch()
    const open = Boolean(collection)

    const [providers, setProviders] = useState<StorageProviderRecord[]>([])
    const [providersLoading, setProvidersLoading] = useState(false)
    const [selectedProviderId, setSelectedProviderId] = useState<string>(NOT_CONNECTED)
    const [remotePrefix, setRemotePrefix] = useState('')
    const [saving, setSaving] = useState(false)
    const [syncing, setSyncing] = useState(false)

    // Initialize form whenever a (new) collection is targeted.
    useEffect(() => {
        if (!collection) return
        setSelectedProviderId(collection.storage_provider_id ?? NOT_CONNECTED)
        setRemotePrefix(collection.remote_prefix ?? '')
        setProvidersLoading(true)
        listStorageProviders()
            .then(setProviders)
            .catch((error) => {
                console.error('Failed to load storage providers:', error)
                toast.error('Failed to load storage providers')
                setProviders([])
            })
            .finally(() => setProvidersLoading(false))
    }, [collection])

    if (!collection) return null

    const boundProvider = collection.storage_provider_id
        ? providers.find((p) => p.id === collection.storage_provider_id)
        : null
    const isBound = Boolean(collection.storage_provider_id)
    const busy = saving || syncing

    const handleSave = async () => {
        if (busy) return
        setSaving(true)
        try {
            await dispatch(updateCollectionCloudBinding({
                collectionId: collection.id,
                projectId: collection.project_id ?? null,
                storageProviderId: selectedProviderId === NOT_CONNECTED ? null : selectedProviderId,
                remotePrefix: selectedProviderId === NOT_CONNECTED ? null : (remotePrefix.trim() || null),
            })).unwrap()
            toast.success('Cloud binding updated')
            await dispatch(fetchCollections())
            onOpenChange(false)
        } catch (error) {
            console.error('Failed to update cloud binding:', error)
            toast.error(error instanceof Error ? error.message : 'Failed to update cloud binding')
        } finally {
            setSaving(false)
        }
    }

    const handleSyncNow = async () => {
        if (busy) return
        setSyncing(true)
        try {
            const result = await syncCollectionRemote(collection.id)
            if (result.ok) {
                toast.success(`Pulled ${result.pulled}, pushed ${result.pushed}, ${result.conflicts} conflicts`)
                if (result.pulled > 0) {
                    await Promise.all([dispatch(fetchScripts()), dispatch(fetchCollections())])
                }
            } else {
                toast.error(result.error ?? 'Sync failed')
            }
        } catch (error) {
            console.error('Failed to sync collection:', error)
            toast.error(error instanceof Error ? error.message : 'Sync failed')
        } finally {
            setSyncing(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" /> Cloud Storage
                    </DialogTitle>
                    <DialogDescription>
                        Bind &quot;{collection.name}&quot; to a cloud storage provider to sync its scripts.
                    </DialogDescription>
                </DialogHeader>

                {providersLoading ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading providers...
                    </div>
                ) : providers.length === 0 ? (
                    <div className="py-4 text-sm text-muted-foreground">
                        No storage providers configured — add one in Settings → Cloud Storage.
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {isBound && (
                            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                                Currently bound to{' '}
                                <span className="font-medium">{boundProvider?.name ?? 'Unknown provider'}</span>
                                {collection.remote_prefix ? <> at <span className="font-mono">{collection.remote_prefix}</span></> : null}
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="cloud-storage-provider">Provider</Label>
                            <Select value={selectedProviderId} onValueChange={setSelectedProviderId} disabled={busy}>
                                <SelectTrigger id="cloud-storage-provider">
                                    <SelectValue placeholder="Select a provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NOT_CONNECTED}>Not connected</SelectItem>
                                    {providers.map((provider) => (
                                        <SelectItem key={provider.id} value={provider.id}>
                                            {provider.name} ({provider.type})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="cloud-storage-prefix">Remote prefix</Label>
                            <Input
                                id="cloud-storage-prefix"
                                placeholder="scripts/myproject"
                                value={remotePrefix}
                                onChange={(e) => setRemotePrefix(e.target.value)}
                                disabled={busy || selectedProviderId === NOT_CONNECTED}
                            />
                            <p className="text-xs text-muted-foreground">
                                Folder or key prefix inside the provider where this collection&apos;s scripts live. Leave empty to use the root.
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:justify-between">
                    <div>
                        {isBound && (
                            <Button variant="outline" onClick={handleSyncNow} disabled={busy}>
                                {syncing ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing...</>
                                ) : (
                                    <><RefreshCw className="mr-2 h-4 w-4" /> Sync now</>
                                )}
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={busy || providers.length === 0}>
                            {saving ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                            ) : (
                                'Save'
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
