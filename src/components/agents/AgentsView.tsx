'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Bot, Check, CheckCircle2, ChevronRight, Copy, Cpu, Eye,
  FileCode, FolderOpen, LoaderCircle, Lock, MessageSquare, Pause, Play,
  Plus, RefreshCw, Send, Shield, ShieldAlert, ShieldCheck, Sparkles, Terminal, X, XCircle
} from 'lucide-react'

type Profile = {
  id: string
  name: string
  provider: 'codex' | 'claude'
  accessLevel: 'observe' | 'develop' | 'full'
  projectId?: string | null
  model?: string | null
}

type Project = {
  id: string
  name: string
  repository_root: string | null
}

type Run = {
  id: string
  profileId: string
  status: string
  provider: string
  createdAt: string
  profile?: Profile
}

type Detail = Run & {
  messages: Array<{ id: string; role: string; content: string; createdAt?: string }>
  artifacts: Array<{ id: string; kind: string; name: string; content?: string | null }>
  usageJson?: string | null
}

type ProviderDiscovery = {
  provider: 'codex' | 'claude'
  available: boolean
  executable: string
  version?: string
  error?: string
}

type PendingPermission = {
  sessionId: string
  requestId: string
  capability: string
  operation: string
  resource: string
  reason?: string
  preview?: unknown
}

const PRESET_PROMPTS = [
  { label: 'Analyze Architecture', prompt: 'Inspect this workspace architecture, identify core components, and summarize key data flows.' },
  { label: 'Generate Unit Tests', prompt: 'Analyze recent changes in this workspace and generate comprehensive unit tests with edge cases.' },
  { label: 'Fix Failing Errors', prompt: 'Inspect recent errors and test failures in this workspace, diagnose root causes, and propose fixes.' },
  { label: 'Security & Secret Audit', prompt: 'Audit this workspace for exposed secrets, unhandled permissions, and security vulnerabilities.' },
  { label: 'Optimize Performance', prompt: 'Analyze hot paths, state management, and memory allocations in this workspace to optimize performance.' },
]

export function AgentsView() {
  const desktop = typeof window !== 'undefined' && Boolean(window.__ELECTRON__ && window.scriptManagerDesktop?.agents)
  
  // Core State
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [discoveries, setDiscoveries] = useState<ProviderDiscovery[]>([])
  const [activeTab, setActiveTab] = useState<'chat' | 'artifacts'>('chat')
  const [copiedText, setCopiedText] = useState<string | null>(null)

  // Profile Creation State
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [name, setName] = useState('Developer agent')
  const [provider, setProvider] = useState<'codex' | 'claude'>('codex')
  const [accessLevel, setAccessLevel] = useState<'observe' | 'develop' | 'full'>('develop')
  const [projectId, setProjectId] = useState('')

  // Active Session & Prompt State
  const [inputPrompt, setInputPrompt] = useState('')
  const [cwd, setCwd] = useState('')
  const [error, setError] = useState('')
  const [isLaunching, setIsLaunching] = useState(false)
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([])

  const chatBottomRef = useRef<HTMLDivElement | null>(null)

  // Load profiles, runs, and projects
  const load = useCallback(async () => {
    try {
      const [p, r, j] = await Promise.all([
        fetch('/api/agents/profiles').then((x) => x.json()),
        fetch('/api/agents/runs').then((x) => x.json()),
        fetch('/api/projects').then((x) => x.json()),
      ])
      setProfiles(Array.isArray(p) ? p : [])
      setRuns(Array.isArray(r) ? r : [])
      setProjects(Array.isArray(j) ? j.filter((item: Project) => item.repository_root) : [])
    } catch {
      // ignore network errors on unmount
    }
  }, [])

  // Discover local agent providers via Electron
  const discoverProviders = useCallback(async () => {
    if (typeof window !== 'undefined' && window.scriptManagerDesktop?.agents?.discover) {
      try {
        const results = (await window.scriptManagerDesktop.agents.discover()) as ProviderDiscovery[]
        setDiscoveries(Array.isArray(results) ? results : [])
      } catch {
        // discovery error handled gracefully
      }
    }
  }, [])

  const selectRun = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agents/runs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void load()
    void discoverProviders()
  }, [load, discoverProviders])

  // Scroll to bottom of chat when new messages appear
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [detail?.messages, activeTab])

  // Listen to live agent events from Electron IPC
  useEffect(() => {
    if (!window.scriptManagerDesktop?.agents?.onEvent) return

    const unsubscribe = window.scriptManagerDesktop.agents.onEvent(async ({ sessionId, event }: any) => {
      if (!event) return

      if (event.type === 'message' && event.message?.content) {
        await fetch(`/api/agents/runs/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            role: event.message.role ?? 'assistant',
            content: event.message.content,
          }),
        })
      }

      if (event.type === 'permission_request' && event.request) {
        setPendingPermissions((prev) => [
          ...prev.filter((p) => p.requestId !== event.request.id),
          {
            sessionId,
            requestId: event.request.id,
            capability: event.request.capability,
            operation: event.request.operation,
            resource: event.request.resource,
            reason: event.request.reason,
            preview: event.request.preview,
          },
        ])
      }

      await selectRun(sessionId)
      await load()
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [load, selectRun])

  // Create Profile
  const createProfile = async () => {
    setError('')
    try {
      const config = await fetch('/api/agents/providers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          name: `${name} provider`,
          executable: provider === 'codex' ? 'codex-acp' : 'claude-agent-acp',
        }),
      }).then((x) => x.json())

      const response = await fetch('/api/agents/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          provider,
          providerConfigId: config.id,
          accessLevel,
          projectId: projectId || undefined,
        }),
      })

      if (!response.ok) {
        const resData = await response.json()
        return setError(resData.error || 'Failed to create profile')
      }

      setIsCreatingProfile(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating profile')
    }
  }

  // Choose local folder
  const chooseFolder = async () => {
    if (typeof window !== 'undefined' && window.scriptManagerDesktop?.selectFolder) {
      const selected = await window.scriptManagerDesktop.selectFolder()
      if (selected) setCwd(selected)
    }
  }

  // Launch Agent Run
  const launch = async (profile: Profile, promptText?: string) => {
    if (!desktop) {
      return setError('Open ScriptManager Desktop to launch local ACP agents.')
    }
    const finalPrompt = promptText || inputPrompt || 'Inspect this workspace and summarize the next useful change.'
    const projectRoot = projects.find((item) => item.id === profile.projectId)?.repository_root
    const workspace = projectRoot || cwd
    if (!workspace) {
      return setError('Select a repository project or choose a context folder.')
    }

    setError('')
    setIsLaunching(true)
    try {
      const response = await fetch('/api/agents/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-scriptmanager-desktop': '1' },
        body: JSON.stringify({ profileId: profile.id, prompt: finalPrompt, cwd: workspace }),
      })
      const run = await response.json()
      if (!response.ok) {
        setIsLaunching(false)
        return setError(run.error || 'Failed to launch agent run.')
      }

      await window.scriptManagerDesktop!.agents!.launch({
        provider: profile.provider,
        sessionId: run.id,
        profileId: profile.id,
        cwd: workspace,
      })
      await window.scriptManagerDesktop!.agents!.input({
        sessionId: run.id,
        message: { role: 'user', content: finalPrompt },
      })

      setInputPrompt('')
      setIsLaunching(false)
      await load()
      await selectRun(run.id)
    } catch (err) {
      setIsLaunching(false)
      setError(err instanceof Error ? err.message : 'Failed to launch agent.')
    }
  }

  // Send follow-up message in active session
  const sendMessage = async () => {
    if (!inputPrompt.trim() || !detail) return
    const text = inputPrompt.trim()
    setInputPrompt('')

    if (desktop && detail.status === 'running') {
      await window.scriptManagerDesktop?.agents?.input({
        sessionId: detail.id,
        message: { role: 'user', content: text },
      })
    }

    await fetch(`/api/agents/runs/${detail.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'user', content: text }),
    })

    if (detail.status !== 'running' && desktop) {
      await fetch(`/api/agents/runs/${detail.id}/resume`, {
        method: 'POST',
        headers: { 'x-scriptmanager-desktop': '1' },
      })
    }

    await load()
    await selectRun(detail.id)
  }

  // Handle in-line permission decision
  const handlePermissionDecision = async (perm: PendingPermission, allowed: boolean) => {
    if (desktop) {
      await window.scriptManagerDesktop?.agents?.permissionDecision({
        sessionId: perm.sessionId,
        requestId: perm.requestId,
        allowed,
      })
    }
    setPendingPermissions((prev) => prev.filter((p) => p.requestId !== perm.requestId))
    await selectRun(perm.sessionId)
    await load()
  }

  // Interrupt session
  const interrupt = async (run: Run) => {
    await window.scriptManagerDesktop?.agents?.interrupt(run.id)
    await fetch(`/api/agents/runs/${run.id}/interrupt`, {
      method: 'POST',
      headers: { 'x-scriptmanager-desktop': '1' },
    })
    await load()
    await selectRun(run.id)
  }

  // Resume session
  const resume = async (run: Run) => {
    const promptToSend = inputPrompt.trim() || 'Please continue.'
    await window.scriptManagerDesktop?.agents?.input({
      sessionId: run.id,
      message: { role: 'user', content: promptToSend },
    })
    await fetch(`/api/agents/runs/${run.id}/resume`, {
      method: 'POST',
      headers: { 'x-scriptmanager-desktop': '1' },
    })
    setInputPrompt('')
    await load()
    await selectRun(run.id)
  }

  // Render formatted message content with code blocks
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(```[\s\S]*?```)/g)
    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n')
        const language = lines[0]?.match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : ''
        const code = (language ? lines.slice(1) : lines).join('\n')
        return (
          <div key={index} className="my-2.5 overflow-hidden rounded-lg border border-wb-border bg-muted/70 text-xs">
            <div className="flex items-center justify-between border-b border-wb-border/60 bg-muted px-3 py-1.5 text-[10px] text-muted-foreground font-mono">
              <span>{language || 'code'}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(code)
                  setCopiedText(code)
                  setTimeout(() => setCopiedText(null), 1500)
                }}
                className="flex items-center gap-1 hover:text-foreground"
              >
                {copiedText === code ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{copiedText === code ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto p-3 font-mono leading-relaxed">{code}</pre>
          </div>
        )
      }
      return (
        <span key={index} className="whitespace-pre-wrap leading-relaxed">
          {part}
        </span>
      )
    })
  }

  return (
    <div className="grid h-full grid-cols-[340px_1fr] bg-background text-foreground select-none">
      {/* ── Left Sidebar: Profiles, Providers & Runs ── */}
      <aside className="flex flex-col overflow-hidden border-r border-wb-border bg-wb-sidepanel">
        {/* Header & Title */}
        <div className="border-b border-wb-border p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold leading-none">AI Agents</h1>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Codex & Claude via ACP</p>
              </div>
            </div>
            <button
              onClick={() => setIsCreatingProfile((v) => !v)}
              title="Create Agent Profile"
              className="flex items-center gap-1 rounded-md bg-accent-brand/10 px-2 py-1 text-xs font-medium text-accent-brand hover:bg-accent-brand/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Provider Discovery Chips */}
          <div className="mt-3 flex items-center gap-2">
            {['codex', 'claude'].map((p) => {
              const d = discoveries.find((item) => item.provider === p)
              const isAvail = d?.available ?? desktop
              return (
                <div
                  key={p}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium border ${
                    isAvail
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                      : 'border-muted bg-muted/30 text-muted-foreground'
                  }`}
                  title={d?.version ? `${p} (${d.version})` : `${p} executable`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${isAvail ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                  <span className="capitalize">{p}</span>
                  <span>{isAvail ? 'Ready' : 'Not found'}</span>
                </div>
              )
            })}
          </div>

          {!desktop && (
            <div className="mt-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
              <strong>Desktop host required.</strong> Launching local agents requires ScriptManager Desktop.
            </div>
          )}
        </div>

        {/* Profile Creator Drawer */}
        {isCreatingProfile && (
          <div className="border-b border-wb-border bg-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>New Agent Profile</span>
              <button onClick={() => setIsCreatingProfile(false)} className="hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              placeholder="Profile name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-md border border-wb-border bg-background px-2.5 text-xs outline-none focus:border-accent-brand"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as 'codex' | 'claude')}
                className="h-8 rounded-md border border-wb-border bg-background px-2 text-xs outline-none focus:border-accent-brand"
              >
                <option value="codex">Codex ACP</option>
                <option value="claude">Claude ACP</option>
              </select>
              <select
                aria-label="Access level"
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value as typeof accessLevel)}
                className="h-8 rounded-md border border-wb-border bg-background px-2 text-xs outline-none focus:border-accent-brand"
              >
                <option value="observe">Observe (Read)</option>
                <option value="develop">Develop (Read/Write)</option>
                <option value="full">Full (Unrestricted)</option>
              </select>
            </div>
            <select
              aria-label="Repository workspace"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 w-full rounded-md border border-wb-border bg-background px-2 text-xs outline-none focus:border-accent-brand"
            >
              <option value="">No repository workspace</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void createProfile()}
              className="h-8 w-full rounded-md bg-accent-brand text-xs font-medium text-white shadow-xs hover:opacity-90"
            >
              Create Profile
            </button>
          </div>
        )}

        {/* Scrollable Profiles & Runs List */}
        <div className="flex-1 overflow-y-auto divide-y divide-wb-border/50">
          {/* Profiles Section */}
          <div className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Profiles ({profiles.length})
            </div>
            <div className="space-y-1.5">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="group flex items-center justify-between rounded-lg border border-wb-border/70 bg-card p-2.5 hover:border-accent-brand/50 hover:shadow-xs transition-all cursor-pointer"
                  onClick={() => void launch(profile)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">{profile.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-mono uppercase text-muted-foreground">
                        {profile.provider}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <ShieldCheck className="h-3 w-3 text-accent-brand" />
                      <span className="capitalize">{profile.accessLevel} access</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void launch(profile)
                    }}
                    title="Launch session"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-brand/10 text-accent-brand group-hover:bg-accent-brand group-hover:text-white transition-colors"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </button>
                </div>
              ))}
              {profiles.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground italic">No profiles created yet.</div>
              )}
            </div>
          </div>

          {/* Activity Runs Section */}
          <div className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Runs ({runs.length})
            </div>
            <div className="space-y-1">
              {runs.map((run) => {
                const isSelected = detail?.id === run.id
                const isRunning = run.status === 'running'
                const isWaiting = run.status === 'waiting_approval'
                return (
                  <button
                    key={run.id}
                    onClick={() => void selectRun(run.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      isSelected ? 'bg-accent-brand/15 text-accent-brand font-medium' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{run.profile?.name ?? run.provider}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ID: {run.id.slice(0, 6)}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        isRunning
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : isWaiting
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : run.status === 'terminated'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isRunning && <LoaderCircle className="h-2.5 w-2.5 animate-spin" />}
                      {isWaiting && <ShieldAlert className="h-2.5 w-2.5" />}
                      <span className="capitalize">{run.status.replace('_', ' ')}</span>
                    </span>
                  </button>
                )
              })}
              {runs.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground italic">No past runs recorded.</div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Stage: Conversation & Artifacts ── */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {detail ? (
          <>
            {/* Session Header */}
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-wb-border px-5 bg-wb-sidepanel/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-brand/10 text-accent-brand">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold truncate">{detail.profile?.name ?? detail.provider}</h2>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                        detail.status === 'running'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                          : detail.status === 'waiting_approval'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {detail.status === 'running' && <LoaderCircle className="h-2.5 w-2.5 animate-spin" />}
                      <span className="capitalize">{detail.status.replace('_', ' ')}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    Session: {detail.id} · {new Date(detail.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Header Right: Tabs & Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5 text-xs">
                  <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium ${
                      activeTab === 'chat' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Chat ({detail.messages.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('artifacts')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium ${
                      activeTab === 'artifacts' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    <span>Artifacts ({detail.artifacts.length})</span>
                  </button>
                </div>

                {detail.status === 'running' ? (
                  <button
                    onClick={() => void interrupt(detail)}
                    className="flex items-center gap-1 rounded-md border border-wb-border px-2.5 py-1 text-xs hover:bg-muted font-medium"
                  >
                    <Pause className="h-3.5 w-3.5 text-amber-500" />
                    <span>Interrupt</span>
                  </button>
                ) : (
                  <button
                    disabled={!desktop}
                    onClick={() => void resume(detail)}
                    className="flex items-center gap-1 rounded-md bg-accent-brand px-3 py-1 text-xs font-medium text-white shadow-xs hover:opacity-90 disabled:opacity-40"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Resume</span>
                  </button>
                )}
              </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-5">
              {activeTab === 'chat' ? (
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Messages Feed */}
                  {detail.messages.map((message) => {
                    const isUser = message.role === 'user'
                    const isTool = message.role === 'tool'
                    return (
                      <div
                        key={message.id}
                        className={`flex gap-3 text-xs ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isUser && (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
                            {isTool ? <Terminal className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                          </div>
                        )}
                        <div
                          className={`max-w-2xl rounded-xl p-3.5 ${
                            isUser
                              ? 'bg-accent-brand text-white shadow-xs'
                              : isTool
                              ? 'bg-muted/80 border border-wb-border font-mono text-[11px]'
                              : 'bg-card border border-wb-border shadow-xs'
                          }`}
                        >
                          <div
                            className={`mb-1 flex items-center justify-between text-[10px] uppercase font-semibold tracking-wider ${
                              isUser ? 'text-white/70' : 'text-muted-foreground'
                            }`}
                          >
                            <span>{message.role}</span>
                            {message.createdAt && <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                          <div className={isUser ? 'whitespace-pre-wrap leading-relaxed' : ''}>
                            {isUser ? message.content : renderMessageContent(message.content)}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* In-Line Permission Request Cards */}
                  {pendingPermissions
                    .filter((p) => p.sessionId === detail.id)
                    .map((perm) => (
                      <div
                        key={perm.requestId}
                        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm space-y-2.5 max-w-2xl"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          <span>Action Requires Approval: {perm.capability}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-1">
                          <div>
                            <strong>Resource:</strong> <span className="font-mono">{perm.resource}</span>
                          </div>
                          {perm.reason && (
                            <div>
                              <strong>Reason:</strong> {perm.reason}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => void handlePermissionDecision(perm, true)}
                            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 shadow-xs"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Allow Action</span>
                          </button>
                          <button
                            onClick={() => void handlePermissionDecision(perm, false)}
                            className="flex items-center gap-1.5 rounded-md border border-wb-border bg-background px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-muted shadow-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Deny</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  <div ref={chatBottomRef} />
                </div>
              ) : (
                /* Artifacts Tab */
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Generated Artifacts & Files ({detail.artifacts.length})
                  </div>
                  <div className="space-y-3">
                    {detail.artifacts.map((a) => (
                      <div key={a.id} className="rounded-xl border border-wb-border bg-card overflow-hidden shadow-xs">
                        <div className="flex items-center justify-between border-b border-wb-border px-4 py-2.5 bg-muted/40 text-xs">
                          <div className="flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-accent-brand" />
                            <span className="font-semibold">{a.name}</span>
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono uppercase text-muted-foreground">
                              {a.kind}
                            </span>
                          </div>
                          {a.content && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(a.content!)
                                setCopiedText(a.id)
                                setTimeout(() => setCopiedText(null), 1500)
                              }}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              {copiedText === a.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedText === a.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          )}
                        </div>
                        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed bg-background/50">
                          {a.content || '(Empty artifact)'}
                        </pre>
                      </div>
                    ))}
                    {detail.artifacts.length === 0 && (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No artifacts generated in this session.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Interactive Prompt & Input Bar */}
            <div className="border-t border-wb-border p-4 bg-wb-sidepanel/30 space-y-2.5">
              {/* Preset Prompts Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-accent-brand" /> Starters:
                </span>
                {PRESET_PROMPTS.map((starter) => (
                  <button
                    key={starter.label}
                    onClick={() => setInputPrompt(starter.prompt)}
                    className="shrink-0 rounded-full border border-wb-border bg-background px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-accent-brand transition-colors"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <div className="flex gap-2">
                <textarea
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendMessage()
                    }
                  }}
                  placeholder="Send a prompt or instruction... (Enter to send, Shift+Enter for new line)"
                  className="min-h-[52px] max-h-32 flex-1 resize-y rounded-lg border border-wb-border bg-background p-2.5 text-xs outline-none focus:border-accent-brand font-sans leading-relaxed"
                />
                <button
                  disabled={!inputPrompt.trim()}
                  onClick={() => void sendMessage()}
                  className="flex h-[52px] w-12 items-center justify-center rounded-lg bg-accent-brand text-white shadow-xs hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Empty / Launch Center Stage */
          <div className="flex h-full flex-col items-center justify-center p-8 max-w-xl mx-auto text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-brand/10 text-accent-brand shadow-sm">
              <Bot className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Autonomous AI Coding Agents</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Run Codex or Claude agent sessions locally with ACP protocol governance, approval gates, and workspace telemetry.
              </p>
            </div>

            {/* Context Folder Selector */}
            <div className="w-full rounded-xl border border-wb-border bg-card p-4 space-y-3 text-left">
              <div className="text-xs font-semibold text-foreground">Active Workspace Context</div>
              <div className="flex gap-2">
                <button
                  onClick={() => void chooseFolder()}
                  className="flex h-9 flex-1 items-center gap-2 rounded-md border border-wb-border bg-background px-3 text-xs hover:bg-muted font-mono truncate"
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-accent-brand" />
                  <span className="truncate">{cwd || 'Choose workspace context folder…'}</span>
                </button>
              </div>
              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder="Describe what the agent should investigate or build..."
                className="h-24 w-full resize-none rounded-md border border-wb-border bg-background p-3 text-xs outline-none focus:border-accent-brand"
              />
              {error && <p className="text-xs text-rose-500">{error}</p>}
            </div>

            {/* Preset Starters */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
              {PRESET_PROMPTS.map((starter) => (
                <button
                  key={starter.label}
                  onClick={() => setInputPrompt(starter.prompt)}
                  className="rounded-full border border-wb-border bg-background px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-accent-brand transition-colors"
                >
                  {starter.label}
                </button>
              ))}
            </div>

            {/* Quick Launch Buttons for Configured Profiles */}
            <div className="w-full pt-2 flex flex-col gap-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  disabled={isLaunching}
                  onClick={() => void launch(profile)}
                  className="flex h-10 w-full items-center justify-between rounded-lg bg-accent-brand px-4 text-xs font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    {isLaunching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                    <span>Launch with {profile.name} ({profile.provider})</span>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-70" />
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
