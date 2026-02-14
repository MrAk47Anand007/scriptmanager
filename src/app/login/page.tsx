'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Lock } from 'lucide-react'

function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const redirect = searchParams.get('redirect') ?? '/'

    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)

    useEffect(() => {
        fetch('/api/auth/login', { method: 'HEAD' })
            .then(res => setIsFirstRun(res.status === 204))
            .catch(() => setIsFirstRun(false))
    }, [])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            })
            if (res.ok) {
                router.push(redirect)
                router.refresh()
            } else {
                const data = await res.json()
                setError(data.error ?? 'Login failed')
            }
        } catch {
            setError('Network error — is the server running?')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-full max-w-sm">
                <div className="bg-white rounded-xl shadow-sm border p-8 space-y-6">
                    <div className="text-center space-y-1">
                        <div className="flex justify-center mb-3">
                            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                                <Lock className="h-6 w-6 text-slate-600" />
                            </div>
                        </div>
                        <h1 className="text-xl font-bold text-slate-800">ScriptManager</h1>
                        <p className="text-sm text-slate-500">
                            {isFirstRun === true
                                ? 'First run — set your master password'
                                : 'Enter your password to continue'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder={isFirstRun === true ? 'Choose a password' : 'Enter password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoFocus
                                autoComplete="current-password"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-500">{error}</p>
                        )}

                        <Button type="submit" className="w-full" disabled={loading || !password}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isFirstRun === true ? 'Set Password & Enter' : 'Sign In'}
                        </Button>
                    </form>

                    <p className="text-xs text-center text-slate-400">
                        Self-hosted · Single user · No cloud
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
            <LoginForm />
        </Suspense>
    )
}
