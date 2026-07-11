'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, Lock, LogOut, KeyRound } from 'lucide-react'
import axios from 'axios'
import { useRouter } from 'next/navigation'

export const SecuritySection = () => {
    const router = useRouter()

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordMessage, setPasswordMessage] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [isChangingPassword, setIsChangingPassword] = useState(false)

    // API token state
    const [hasApiToken, setHasApiToken] = useState(false)
    const [generatedApiToken, setGeneratedApiToken] = useState('')
    const [apiTokenMessage, setApiTokenMessage] = useState('')
    const [apiTokenError, setApiTokenError] = useState('')
    const [isApiTokenLoading, setIsApiTokenLoading] = useState(false)

    useEffect(() => {
        axios.get('/api/auth/api-token')
            .then((res) => setHasApiToken(!!res.data?.has_token))
            .catch(() => setHasApiToken(false))
    }, [])

    const handleChangePassword = async () => {
        setPasswordError('')
        setPasswordMessage('')
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match')
            return
        }
        if (newPassword.length < 1) {
            setPasswordError('Password cannot be empty')
            return
        }
        setIsChangingPassword(true)
        try {
            const res = await axios.post('/api/auth/change-password', { currentPassword, newPassword })
            if (res.data.ok) {
                setPasswordMessage('Password updated successfully!')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                setTimeout(() => setPasswordMessage(''), 3000)
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } }
            setPasswordError(axiosErr.response?.data?.error ?? 'Failed to change password')
        } finally {
            setIsChangingPassword(false)
        }
    }

    const handleLogout = async () => {
        await axios.post('/api/auth/logout')
        router.push('/login')
    }

    const handleGenerateApiToken = async () => {
        setApiTokenError('')
        setApiTokenMessage('')
        setGeneratedApiToken('')
        setIsApiTokenLoading(true)

        try {
            const res = await axios.post('/api/auth/api-token')
            setHasApiToken(true)
            setGeneratedApiToken(res.data.token ?? '')
            setApiTokenMessage(hasApiToken ? 'API token rotated. Update any CLI configs now.' : 'API token created successfully.')
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } }
            setApiTokenError(axiosErr.response?.data?.error ?? 'Failed to generate API token')
        } finally {
            setIsApiTokenLoading(false)
        }
    }

    const handleRevokeApiToken = async () => {
        setApiTokenError('')
        setApiTokenMessage('')
        setGeneratedApiToken('')
        setIsApiTokenLoading(true)

        try {
            await axios.delete('/api/auth/api-token')
            setHasApiToken(false)
            setApiTokenMessage('API token revoked.')
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } }
            setApiTokenError(axiosErr.response?.data?.error ?? 'Failed to revoke API token')
        } finally {
            setIsApiTokenLoading(false)
        }
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Security</h2>
                <p className="text-muted-foreground">Master password, API access tokens, and session.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Password</CardTitle>
                    <CardDescription>
                        Change the master password used to access ScriptManager.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {passwordMessage && (
                        <Alert className="border-success/40 text-success">
                            <AlertTitle>Success</AlertTitle>
                            <AlertDescription>{passwordMessage}</AlertDescription>
                        </Alert>
                    )}
                    {passwordError && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{passwordError}</AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="current_password">Current Password</Label>
                        <Input
                            id="current_password"
                            type="password"
                            placeholder="Leave blank if not yet set"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="new_password">New Password</Label>
                        <Input
                            id="new_password"
                            type="password"
                            placeholder="New password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm_password">Confirm New Password</Label>
                        <Input
                            id="confirm_password"
                            type="password"
                            placeholder="Repeat new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <Button variant="outline" onClick={handleChangePassword} disabled={isChangingPassword || !newPassword}>
                        {isChangingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                        Change Password
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> CLI API Token</CardTitle>
                    <CardDescription>
                        Use a bearer token for CLI and automation access. The raw token is only shown once when generated.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {apiTokenMessage && (
                        <p className="text-xs text-success">{apiTokenMessage}</p>
                    )}
                    {apiTokenError && (
                        <p className="text-xs text-destructive">{apiTokenError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Status: {hasApiToken ? 'Configured' : 'Not configured'}
                    </p>
                    {generatedApiToken && (
                        <div className="rounded border border-warning/40 bg-warning/10 p-3">
                            <p className="text-xs font-medium text-warning">Copy this token now. It will not be shown again.</p>
                            <p className="mt-2 break-all font-mono text-xs">{generatedApiToken}</p>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleGenerateApiToken} disabled={isApiTokenLoading}>
                            {isApiTokenLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                            {hasApiToken ? 'Regenerate API Token' : 'Generate API Token'}
                        </Button>
                        <Button variant="ghost" onClick={handleRevokeApiToken} disabled={isApiTokenLoading || !hasApiToken}>
                            Revoke Token
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5" /> Session</CardTitle>
                    <CardDescription>Sign out of ScriptManager on this device.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </CardContent>
            </Card>
        </section>
    )
}
