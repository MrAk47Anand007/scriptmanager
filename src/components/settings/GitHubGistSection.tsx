'use client'

import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { saveSettings } from '@/features/settings/settingsSlice'
import { selectSettings, selectSettingsStatus } from '@/features/settings/selectors'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Save, Github } from 'lucide-react'

export const GitHubGistSection = () => {
    const dispatch = useAppDispatch()
    const settings = useAppSelector(selectSettings)
    const status = useAppSelector(selectSettingsStatus)

    const [githubToken, setGithubToken] = useState('')
    const [gistSyncEnabled, setGistSyncEnabled] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (status === 'succeeded') {
            setGithubToken(settings['github_token'] || '')
            setGistSyncEnabled(settings['gist_sync_enabled'] === 'true')
        }
    }, [settings, status])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            await dispatch(saveSettings({
                'github_token': githubToken,
                'gist_sync_enabled': String(gistSyncEnabled),
            })).unwrap()
            toast.success('GitHub settings saved')
        } catch (err) {
            console.error(err)
            toast.error('Failed to save settings')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">GitHub Gist</h2>
                <p className="text-muted-foreground">Sync your scripts to GitHub Gists for backup and sharing.</p>
            </div>

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
                        <p className="text-xs text-muted-foreground">
                            Required scope: <code>gist</code>. Generate at{' '}
                            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="underline text-accent-brand">
                                github.com/settings/tokens
                            </a>
                        </p>
                    </div>

                    <div className="flex items-center justify-between space-x-2 border-t border-wb-border pt-4">
                        <div className="space-y-0.5">
                            <Label htmlFor="gist_sync_enabled">Sync New Scripts by Default</Label>
                            <p className="text-xs text-muted-foreground">
                                Automatically enable Gist syncing for newly created scripts.
                            </p>
                        </div>
                        <Switch
                            id="gist_sync_enabled"
                            checked={gistSyncEnabled}
                            onCheckedChange={setGistSyncEnabled}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Settings
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
