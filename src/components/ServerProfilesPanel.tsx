'use client'

import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
    fetchServerProfiles,
    createServerProfile,
    updateServerProfile,
    deleteServerProfile,
    setSelectedProfile,
} from '@/features/ops/opsSlice'
import type { ServerProfile } from '@/features/ops/opsSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Server, Plus, Trash2, ChevronDown, ChevronUp, Edit2, Check, X,
    KeyRound, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ENV_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
    development: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
    qa: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
    uat: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
    production: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

interface ProfileFormState {
    name: string
    host: string
    port: string
    username: string
    auth_method: 'password' | 'key'
    secret: string
    key_path: string
    project_id: string
    notes: string
}

const defaultForm = (): ProfileFormState => ({
    name: '',
    host: '',
    port: '22',
    username: '',
    auth_method: 'password',
    secret: '',
    key_path: '',
    project_id: '',
    notes: '',
})

export function ServerProfilesPanel() {
    const dispatch = useAppDispatch()
    const { serverProfiles, selectedProfileId, serverProfilesStatus, projects } = useAppSelector(
        (state) => state.ops
    )

    const [isExpanded, setIsExpanded] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<ProfileFormState>(defaultForm())
    const [formError, setFormError] = useState('')
    const [showSecret, setShowSecret] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const updateForm = (field: keyof ProfileFormState, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }))
        if (formError) setFormError('')
    }

    const validateForm = (): boolean => {
        if (!form.name.trim()) { setFormError('Name is required'); return false }
        if (!form.host.trim()) { setFormError('Host is required'); return false }
        if (!form.username.trim()) { setFormError('Username is required'); return false }
        const port = parseInt(form.port, 10)
        if (isNaN(port) || port < 1 || port > 65535) { setFormError('Port must be 1–65535'); return false }
        return true
    }

    const handleAdd = async () => {
        if (!validateForm()) return
        setIsSaving(true)
        try {
            await dispatch(createServerProfile({
                name: form.name.trim(),
                host: form.host.trim(),
                port: parseInt(form.port, 10),
                username: form.username.trim(),
                auth_method: form.auth_method,
                secret: form.secret || undefined,
                key_path: form.key_path || undefined,
                project_id: form.project_id || null,
                notes: form.notes,
            }))
            setForm(defaultForm())
            setIsAdding(false)
            setShowSecret(false)
        } finally {
            setIsSaving(false)
        }
    }

    const startEdit = (profile: ServerProfile) => {
        setEditingId(profile.id)
        setForm({
            name: profile.name,
            host: profile.host,
            port: String(profile.port),
            username: profile.username,
            auth_method: profile.auth_method,
            secret: '',
            key_path: profile.key_path ?? '',
            project_id: profile.project_id ?? '',
            notes: profile.notes,
        })
        setFormError('')
        setShowSecret(false)
    }

    const handleUpdate = async () => {
        if (!validateForm() || !editingId) return
        setIsSaving(true)
        try {
            await dispatch(updateServerProfile({
                id: editingId,
                name: form.name.trim(),
                host: form.host.trim(),
                port: parseInt(form.port, 10),
                username: form.username.trim(),
                auth_method: form.auth_method,
                ...(form.secret ? { secret: form.secret } : {}),
                key_path: form.key_path || undefined,
                project_id: form.project_id || null,
                notes: form.notes,
            }))
            setEditingId(null)
            setForm(defaultForm())
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this server profile?')) return
        await dispatch(deleteServerProfile(id))
    }

    const cancelForm = () => {
        setIsAdding(false)
        setEditingId(null)
        setForm(defaultForm())
        setFormError('')
        setShowSecret(false)
    }

    const isFormOpen = isAdding || !!editingId

    return (
        <div className="border-b dark:border-slate-700">
            {/* Header */}
            <div className="px-3 py-2 flex items-center justify-between gap-2 overflow-hidden">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1.5 flex-1 min-w-0">
                    <Server className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="truncate">Server Profiles</span>
                    <span className="ml-1 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded px-1 font-bold shrink-0">
                        {serverProfiles.length}
                    </span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        title="Add server profile"
                        onClick={() => { setIsAdding(true); setIsExpanded(true); setEditingId(null) }}
                    >
                        <Plus className="h-3 w-3 text-slate-400" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded
                            ? <ChevronUp className="h-3 w-3 text-slate-400" />
                            : <ChevronDown className="h-3 w-3 text-slate-400" />
                        }
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-1.5">
                    {serverProfilesStatus === 'loading' && (
                        <p className="text-[10px] text-slate-400 italic">Loading…</p>
                    )}

                    {serverProfiles.length === 0 && !isFormOpen && (
                        <p className="text-[10px] text-slate-400 italic">
                            No server profiles. Click <span className="font-semibold">+</span> to add one.
                        </p>
                    )}

                    {/* Profile list */}
                    {serverProfiles.map(profile => {
                        const isEditing = editingId === profile.id
                        const isSelected = selectedProfileId === profile.id
                        const project = projects.find(p => p.id === profile.project_id)

                        if (isEditing) {
                            return (
                                <div key={profile.id} className="border border-amber-200 dark:border-amber-900/50 rounded p-2 bg-amber-50/40 dark:bg-amber-900/10 space-y-1.5">
                                    <ProfileForm
                                        form={form}
                                        updateForm={updateForm}
                                        projects={projects}
                                        showSecret={showSecret}
                                        setShowSecret={setShowSecret}
                                        formError={formError}
                                        isEditMode
                                    />
                                    <div className="flex gap-1">
                                        <Button size="sm" className="h-6 text-xs flex-1" onClick={handleUpdate} disabled={isSaving}>
                                            {isSaving ? 'Saving…' : <><Check className="h-3 w-3 mr-1" />Save</>}
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={cancelForm}>
                                            <X className="h-3 w-3 mr-1" />Cancel
                                        </Button>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div
                                key={profile.id}
                                onClick={() => dispatch(setSelectedProfile(isSelected ? null : profile.id))}
                                className={cn(
                                    "border rounded px-2 py-1.5 cursor-pointer transition-colors group",
                                    isSelected
                                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
                                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600"
                                )}
                            >
                                <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1">
                                            <Server className={cn("h-3 w-3 shrink-0", isSelected ? "text-amber-500" : "text-slate-400")} />
                                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">{profile.name}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 ml-4 truncate">
                                            {profile.username}@{profile.host}:{profile.port}
                                        </div>
                                        <div className="flex items-center gap-1 mt-0.5 ml-4">
                                            <span className={cn(
                                                "text-[9px] font-medium px-1 rounded",
                                                profile.auth_method === 'key'
                                                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                                                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                            )}>
                                                {profile.auth_method === 'key' ? (
                                                    <span className="flex items-center gap-0.5"><KeyRound className="h-2 w-2" /> key</span>
                                                ) : 'password'}
                                            </span>
                                            {profile.has_secret && (
                                                <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded px-1">
                                                    ✓ creds
                                                </span>
                                            )}
                                            {project && (
                                                <span className={cn(
                                                    "text-[9px] rounded px-1 font-medium",
                                                    ENV_BADGE_COLORS[project.environment]?.bg ?? 'bg-slate-100',
                                                    ENV_BADGE_COLORS[project.environment]?.text ?? 'text-slate-500',
                                                )}>
                                                    {project.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5"
                                            title="Edit"
                                            onClick={() => startEdit(profile)}
                                        >
                                            <Edit2 className="h-2.5 w-2.5 text-slate-400" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5"
                                            title="Delete"
                                            onClick={() => handleDelete(profile.id)}
                                        >
                                            <Trash2 className="h-2.5 w-2.5 text-red-400" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {/* Add new profile form */}
                    {isAdding && (
                        <div className="border border-amber-200 dark:border-amber-900/50 rounded p-2 bg-amber-50/40 dark:bg-amber-900/10 space-y-1.5">
                            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase">New Server Profile</p>
                            <ProfileForm
                                form={form}
                                updateForm={updateForm}
                                projects={projects}
                                showSecret={showSecret}
                                setShowSecret={setShowSecret}
                                formError={formError}
                                isEditMode={false}
                            />
                            <div className="flex gap-1">
                                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleAdd} disabled={isSaving}>
                                    {isSaving ? 'Adding…' : 'Add Profile'}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={cancelForm}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    {selectedProfileId && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            ✓ Selected: {serverProfiles.find(p => p.id === selectedProfileId)?.name}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

// Extracted form to avoid duplication between add and edit
function ProfileForm({
    form,
    updateForm,
    projects,
    showSecret,
    setShowSecret,
    formError,
    isEditMode,
}: {
    form: ProfileFormState
    updateForm: (field: keyof ProfileFormState, value: string) => void
    projects: import('@/features/ops/opsSlice').Project[]
    showSecret: boolean
    setShowSecret: (v: boolean) => void
    formError: string
    isEditMode: boolean
}) {
    return (
        <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
                <div>
                    <Label className="text-[10px] text-slate-500">Name *</Label>
                    <Input
                        autoFocus={!isEditMode}
                        className="h-6 text-xs"
                        placeholder="Prod-Server-01"
                        value={form.name}
                        onChange={e => updateForm('name', e.target.value)}
                    />
                </div>
                <div>
                    <Label className="text-[10px] text-slate-500">Port</Label>
                    <Input
                        className="h-6 text-xs font-mono"
                        placeholder="22"
                        value={form.port}
                        onChange={e => updateForm('port', e.target.value)}
                    />
                </div>
            </div>
            <div>
                <Label className="text-[10px] text-slate-500">Host *</Label>
                <Input
                    className="h-6 text-xs font-mono"
                    placeholder="192.168.1.100 or server.example.com"
                    value={form.host}
                    onChange={e => updateForm('host', e.target.value)}
                />
            </div>
            <div>
                <Label className="text-[10px] text-slate-500">Username *</Label>
                <Input
                    className="h-6 text-xs font-mono"
                    placeholder="ubuntu"
                    value={form.username}
                    onChange={e => updateForm('username', e.target.value)}
                />
            </div>
            <div>
                <Label className="text-[10px] text-slate-500">Auth Method</Label>
                <Select value={form.auth_method} onValueChange={v => updateForm('auth_method', v)}>
                    <SelectTrigger className="h-6 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="password">Password</SelectItem>
                        <SelectItem value="key">SSH Key</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {form.auth_method === 'password' && (
                <div>
                    <Label className="text-[10px] text-slate-500">
                        Password {isEditMode && <span className="text-slate-400">(leave blank to keep existing)</span>}
                    </Label>
                    <div className="relative">
                        <Input
                            className="h-6 text-xs pr-7"
                            type={showSecret ? 'text' : 'password'}
                            placeholder={isEditMode ? '••••••••' : 'Enter password'}
                            value={form.secret}
                            onChange={e => updateForm('secret', e.target.value)}
                        />
                        <button
                            type="button"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            onClick={() => setShowSecret(!showSecret)}
                        >
                            {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                    </div>
                </div>
            )}
            {form.auth_method === 'key' && (
                <div>
                    <Label className="text-[10px] text-slate-500">Private Key Path (server-side)</Label>
                    <Input
                        className="h-6 text-xs font-mono"
                        placeholder="/home/user/.ssh/id_rsa"
                        value={form.key_path}
                        onChange={e => updateForm('key_path', e.target.value)}
                    />
                </div>
            )}
            {projects.length > 0 && (
                <div>
                    <Label className="text-[10px] text-slate-500">Project (optional)</Label>
                    <Select value={form.project_id || '__none__'} onValueChange={v => updateForm('project_id', v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-6 text-xs">
                            <SelectValue placeholder="No project" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">No project</SelectItem>
                            {projects.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div>
                <Label className="text-[10px] text-slate-500">Notes (optional)</Label>
                <Input
                    className="h-6 text-xs"
                    placeholder="e.g. production web server"
                    value={form.notes}
                    onChange={e => updateForm('notes', e.target.value)}
                />
            </div>
            {formError && <p className="text-[10px] text-red-500">{formError}</p>}
        </div>
    )
}
