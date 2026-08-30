'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FileCode, FolderOpen,
  GitBranch, GitCommit, GitPullRequest, History, KeyRound, LoaderCircle, Lock, Minus, Plus,
  RefreshCw, RotateCcw, Sparkles, Upload, Download, ArrowUp, ArrowDown, X
} from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchProjects, updateProject } from '@/features/ops/opsSlice'
import { runGitAction, selectDiffPath, selectGitProject, setGitTab } from '@/features/git/gitSlice'
import { extractRepoName } from '@/lib/git/urlUtils'
import type { GitAction, GitFileStatus } from '@/lib/git/types'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

export function SourceControlWorkbench() {
  const dispatch = useAppDispatch()
  const projects = useAppSelector((s) => s.ops.projects)
  const git = useAppSelector((s) => s.git)

  const [message, setMessage] = useState('')
  const [repositoryRoot, setRepositoryRoot] = useState('')
  const [isStagedOpen, setIsStagedOpen] = useState(true)
  const [isChangesOpen, setIsChangesOpen] = useState(true)
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [isCreatingBranch, setIsCreatingBranch] = useState(false)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  // Clone Repository Modal State
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneDestination, setCloneDestination] = useState('')
  const [cloneProjectName, setCloneProjectName] = useState('')
  const [cloneToken, setCloneToken] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [showTokenSecret, setShowTokenSecret] = useState(false)
  const [isProbing, setIsProbing] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloneNotice, setCloneNotice] = useState<string | null>(null)

  useEffect(() => {
    void dispatch(fetchProjects())
  }, [dispatch])

  const run = async (action: GitAction) => {
    if (!git.projectId) return null
    try {
      return await dispatch(runGitAction({ projectId: git.projectId, action })).unwrap()
    } catch (error) {
      toast.error(getOperationError(error, `Git ${action.action} failed`))
      return null
    }
  }

  const selectedProject = projects.find((project) => project.id === git.projectId)

  useEffect(() => {
    if (git.projectId && selectedProject?.repository_root) {
      void run({ action: 'status' })
      void run({ action: 'branches' })
      void run({ action: 'log' })
    }
  }, [git.projectId, selectedProject?.repository_root]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDiff = useMemo(
    () => git.diff.find((file) => file.path === git.selectedPath),
    [git.diff, git.selectedPath]
  )

  const selectFile = (path: string) => {
    dispatch(selectDiffPath(path))
    void run({ action: 'diff', path })
  }

  const stagedFiles: GitFileStatus[] = useMemo(() => {
    if (git.status?.staged) return git.status.staged
    return (git.status?.files ?? []).filter((f) => Boolean(f.index && f.index !== ' ' && f.index !== '?'))
  }, [git.status])

  const unstagedFiles: GitFileStatus[] = useMemo(() => {
    if (git.status?.unstaged) return git.status.unstaged
    return (git.status?.files ?? []).filter((f) => Boolean((f.workingTree && f.workingTree !== ' ') || (f.index === '?' && f.workingTree === '?')))
  }, [git.status])

  const handleBrowseFolder = async () => {
    if (typeof window !== 'undefined' && window.scriptManagerDesktop?.selectFolder) {
      const selected = await window.scriptManagerDesktop.selectFolder()
      if (selected) {
        setRepositoryRoot(selected)
      }
    }
  }

  const handleBrowseCloneFolder = async () => {
    if (typeof window !== 'undefined' && window.scriptManagerDesktop?.selectFolder) {
      const selected = await window.scriptManagerDesktop.selectFolder()
      if (selected) {
        setCloneDestination(selected)
      }
    }
  }

  const handleUrlChange = (url: string) => {
    setCloneUrl(url)
    setCloneError(null)
    setCloneNotice(null)
    if (url.trim()) {
      const derived = extractRepoName(url)
      setCloneProjectName(derived)
    }
  }

  const handleStartClone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cloneUrl.trim() || !cloneDestination.trim()) return

    setCloneError(null)
    setCloneNotice(null)

    // Probe first if token not provided yet
    if (!cloneToken.trim()) {
      setIsProbing(true)
      try {
        const probeRes = await fetch('/api/git/probe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: cloneUrl.trim() }),
        })
        const probeData = await probeRes.json()
        setIsProbing(false)

        if (probeData.status === 'auth_required' || probeData.status === 'auth_failed') {
          setShowTokenInput(true)
          setCloneNotice(probeData.message || 'Private repository detected. Please provide a Personal Access Token (PAT).')
          return
        }

        if (probeData.status === 'error') {
          setCloneError(probeData.message || 'Failed to reach repository.')
          return
        }
      } catch (err) {
        setIsProbing(false)
        setCloneError(err instanceof Error ? err.message : 'Network error probing repository')
        return
      }
    }

    // Execute Clone
    setIsCloning(true)
    try {
      const cloneRes = await fetch('/api/git/clone', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: cloneUrl.trim(),
          targetPath: cloneDestination.trim(),
          token: cloneToken.trim() || undefined,
          projectName: cloneProjectName.trim() || undefined,
        }),
      })
      const cloneData = await cloneRes.json()
      setIsCloning(false)

      if (!cloneRes.ok) {
        if (cloneData.error?.includes('Authentication failed')) {
          setShowTokenInput(true)
          setCloneError('Authentication failed. Please verify your Personal Access Token.')
        } else {
          setCloneError(cloneData.error || 'Failed to clone repository.')
        }
        return
      }

      // Success! Reset and switch to new project
      setIsCloneModalOpen(false)
      setCloneUrl('')
      setCloneDestination('')
      setCloneProjectName('')
      setCloneToken('')
      setShowTokenInput(false)
      await dispatch(fetchProjects())
      if (cloneData.id) {
        dispatch(selectGitProject(cloneData.id))
      }
    } catch (err) {
      setIsCloning(false)
      setCloneError(err instanceof Error ? err.message : 'Clone failed.')
    }
  }

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const projectId = git.projectId
    const root = repositoryRoot.trim()
    if (!root || !projectId) return
    try {
      await dispatch(updateProject({ id: projectId, repository_root: root })).unwrap()
      await dispatch(fetchProjects()).unwrap()
      dispatch(selectGitProject(projectId))
      setRepositoryRoot('')
    } catch (error) {
      toast.error(getOperationError(error, 'Repository could not be connected'))
    }
  }

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    // If no staged files exist, stage all before commit for convenience
    if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
      await run({ action: 'add', path: '.' })
    }
    await run({ action: 'commit', message })
    setMessage('')
    await run({ action: 'status' })
    await run({ action: 'log' })
  }

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBranchName.trim()) return
    await run({ action: 'branch_create', branch: newBranchName.trim() })
    setNewBranchName('')
    setIsCreatingBranch(false)
    setIsBranchMenuOpen(false)
    await run({ action: 'status' })
    await run({ action: 'branches' })
  }

  const handleSwitchBranch = async (branch: string) => {
    await run({ action: 'checkout', branch })
    setIsBranchMenuOpen(false)
    await run({ action: 'status' })
    await run({ action: 'branches' })
  }

  const renderDiffLine = (line: string, index: number) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return (
        <div key={index} className="flex bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-mono text-xs px-3 py-0.5 border-l-2 border-emerald-500">
          <span className="w-6 shrink-0 select-none opacity-50 text-right pr-2">+</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{line.slice(1)}</span>
        </div>
      )
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return (
        <div key={index} className="flex bg-rose-500/10 text-rose-700 dark:text-rose-300 font-mono text-xs px-3 py-0.5 border-l-2 border-rose-500">
          <span className="w-6 shrink-0 select-none opacity-50 text-right pr-2">-</span>
          <span className="flex-1 whitespace-pre-wrap break-all">{line.slice(1)}</span>
        </div>
      )
    }
    if (line.startsWith('@@')) {
      return (
        <div key={index} className="bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono text-xs px-3 py-1 my-1 border-y border-blue-500/20">
          <span className="font-semibold">{line}</span>
        </div>
      )
    }
    return (
      <div key={index} className="flex text-muted-foreground font-mono text-xs px-3 py-0.5 hover:bg-muted/30">
        <span className="w-6 shrink-0 select-none opacity-30 text-right pr-2"> </span>
        <span className="flex-1 whitespace-pre-wrap break-all">{line.startsWith(' ') ? line.slice(1) : line}</span>
      </div>
    )
  }

  return (
    <div className="relative flex h-full bg-background text-foreground select-none">
      {/* ── Left Sidebar ── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-wb-border bg-wb-sidepanel">
        {/* Project & Repository Selector */}
        <div className="border-b border-wb-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
              Repository Workspace
            </span>
            <button
              onClick={() => setIsCloneModalOpen(true)}
              title="Clone repository from URL"
              className="flex items-center gap-1 text-[11px] font-medium text-accent-brand hover:underline"
            >
              <Download className="h-3 w-3" />
              <span>Clone Repo</span>
            </button>
          </div>
          <select
            aria-label="Repository project"
            value={git.projectId ?? ''}
            onChange={(e) => dispatch(selectGitProject(e.target.value || null))}
            className="h-8 w-full rounded-md border border-wb-border bg-background px-2.5 text-xs focus:border-accent-brand outline-none"
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Not Connected: Connect Form */}
        {git.projectId && !selectedProject?.repository_root && (
          <form className="space-y-3 border-b border-wb-border p-4" onSubmit={handleConnect}>
            <div>
              <p className="text-xs font-medium text-foreground">Connect Git Repository</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Select or paste the root directory of a local Git repository.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                aria-label="Repository root"
                value={repositoryRoot}
                onChange={(e) => setRepositoryRoot(e.target.value)}
                placeholder="C:\path\to\repository"
                className="h-8 flex-1 rounded-md border border-wb-border bg-background px-2.5 text-xs outline-none focus:border-accent-brand font-mono"
              />
              <button
                type="button"
                onClick={handleBrowseFolder}
                title="Browse folder"
                className="flex h-8 items-center gap-1.5 rounded-md border border-wb-border bg-background px-2 text-xs hover:bg-muted"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
            <button className="h-8 w-full rounded-md bg-accent-brand text-xs font-medium text-white shadow-sm hover:opacity-90">
              Connect repository
            </button>
          </form>
        )}

        {/* Connected Repository Controls */}
        {git.projectId && selectedProject?.repository_root && (
          <>
            {/* Branch Header & Sync Bar */}
            <div className="flex h-10 items-center justify-between border-b border-wb-border px-3 text-xs bg-muted/20">
              <div className="relative flex items-center gap-1.5">
                <button
                  onClick={() => setIsBranchMenuOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded px-1.5 py-1 font-medium hover:bg-muted text-accent-brand"
                  title="Switch or create branch"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="max-w-[120px] truncate">{git.status?.branch ?? 'main'}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {/* Branch Switcher Popup */}
                {isBranchMenuOpen && (
                  <div className="absolute left-0 top-9 z-50 w-56 rounded-lg border border-wb-border bg-popover p-2 shadow-xl">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-wb-border">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Branches
                      </span>
                      <button
                        onClick={() => setIsCreatingBranch((v) => !v)}
                        className="text-[11px] text-accent-brand hover:underline flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> New
                      </button>
                    </div>

                    {isCreatingBranch && (
                      <form onSubmit={handleCreateBranch} className="mb-2 space-y-1.5">
                        <input
                          autoFocus
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          placeholder="feature-branch"
                          className="h-7 w-full rounded border border-wb-border bg-background px-2 text-xs font-mono outline-none focus:border-accent-brand"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="submit"
                            disabled={!newBranchName.trim()}
                            className="h-6 flex-1 rounded bg-accent-brand text-[10px] text-white disabled:opacity-40"
                          >
                            Create
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsCreatingBranch(false)}
                            className="h-6 px-2 rounded border border-wb-border text-[10px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {(git.branches?.local ?? ['main']).map((b) => (
                        <button
                          key={b}
                          onClick={() => handleSwitchBranch(b)}
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                            b === git.status?.branch
                              ? 'bg-accent-brand/10 text-accent-brand font-medium'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <span className="truncate">{b}</span>
                          {b === git.status?.branch && <Check className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sync status & refresh */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1" title="Commits ahead/behind upstream">
                  <ArrowUp className="h-3 w-3 text-emerald-500" />
                  {git.status?.ahead ?? 0}
                  <ArrowDown className="h-3 w-3 text-blue-500 ml-0.5" />
                  {git.status?.behind ?? 0}
                </span>
                <button
                  aria-label="Refresh Git status"
                  onClick={() => {
                    void run({ action: 'status' })
                    void run({ action: 'branches' })
                    void run({ action: 'log' })
                  }}
                  title="Refresh status"
                  className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${git.pending ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Conflicted Notice */}
            {git.status?.files.some((f) => f.state === 'conflicted') && (
              <div className="flex gap-2 border-b border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Resolve conflicted files before committing.</span>
              </div>
            )}

            {/* Changes Accordions */}
            <div className="flex-1 overflow-y-auto divide-y divide-wb-border/50">
              {/* STAGED CHANGES */}
              <div>
                <div
                  onClick={() => setIsStagedOpen((v) => !v)}
                  className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    {isStagedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>STAGED CHANGES</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                      {stagedFiles.length}
                    </span>
                  </div>
                  {stagedFiles.length > 0 && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await run({ action: 'reset' })
                        await run({ action: 'status' })
                      }}
                      title="Unstage all changes"
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {isStagedOpen && (
                  <div className="pb-1">
                    {stagedFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => selectFile(file.path)}
                        className={`group flex w-full items-center justify-between px-3 py-1.5 text-left text-xs cursor-pointer ${
                          git.selectedPath === file.path ? 'bg-accent-brand/10 text-accent-brand' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`w-3.5 font-mono text-[11px] font-bold ${
                              file.state === 'added'
                                ? 'text-emerald-500'
                                : file.state === 'deleted'
                                ? 'text-rose-500'
                                : 'text-blue-500'
                            }`}
                          >
                            {file.state[0].toUpperCase()}
                          </span>
                          <span className="truncate">{file.path}</span>
                        </div>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              await run({ action: 'reset', path: file.path })
                              await run({ action: 'status' })
                            }}
                            title="Unstage changes"
                            className="rounded p-1 hover:bg-muted-foreground/20"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {stagedFiles.length === 0 && (
                      <div className="px-5 py-2 text-[11px] text-muted-foreground italic">No staged changes</div>
                    )}
                  </div>
                )}
              </div>

              {/* UNSTAGED CHANGES */}
              <div>
                <div
                  onClick={() => setIsChangesOpen((v) => !v)}
                  className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    {isChangesOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>CHANGES</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                      {unstagedFiles.length}
                    </span>
                  </div>
                  {unstagedFiles.length > 0 && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        await run({ action: 'add', path: '.' })
                        await run({ action: 'status' })
                      }}
                      title="Stage all changes"
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {isChangesOpen && (
                  <div className="pb-1">
                    {unstagedFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => selectFile(file.path)}
                        className={`group flex w-full items-center justify-between px-3 py-1.5 text-left text-xs cursor-pointer ${
                          git.selectedPath === file.path ? 'bg-accent-brand/10 text-accent-brand' : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`w-3.5 font-mono text-[11px] font-bold ${
                              file.state === 'untracked'
                                ? 'text-emerald-500'
                                : file.state === 'deleted'
                                ? 'text-rose-500'
                                : file.state === 'conflicted'
                                ? 'text-amber-500'
                                : 'text-accent-brand'
                            }`}
                          >
                            {file.state === 'untracked' ? 'U' : file.state[0].toUpperCase()}
                          </span>
                          <span className="truncate">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (confirm(`Discard changes to ${file.path}?`)) {
                                await run({ action: 'restore', path: file.path })
                                await run({ action: 'status' })
                              }
                            }}
                            title="Discard changes"
                            className="rounded p-1 hover:bg-muted-foreground/20 text-rose-500"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              await run({ action: 'add', path: file.path })
                              await run({ action: 'status' })
                            }}
                            title="Stage changes"
                            className="rounded p-1 hover:bg-muted-foreground/20 text-emerald-500"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {unstagedFiles.length === 0 && (
                      <div className="px-5 py-4 text-center text-[11px] text-muted-foreground flex items-center justify-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-emerald-500" /> Working tree clean
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Commit Form */}
            <form className="border-t border-wb-border p-3 bg-muted/10 space-y-2" onSubmit={handleCommit}>
              <textarea
                aria-label="Commit message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Commit message (Ctrl+Enter to commit)"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault()
                    void handleCommit(e)
                  }
                }}
                className="h-16 w-full resize-none rounded-md border border-wb-border bg-background p-2.5 text-xs outline-none focus:border-accent-brand font-mono"
              />
              <button
                disabled={!message.trim() || Boolean(git.pending)}
                className="flex h-8 w-full items-center justify-center gap-2 rounded-md bg-accent-brand text-xs font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-40"
              >
                <GitCommit className="h-3.5 w-3.5" />
                <span>Commit {stagedFiles.length > 0 ? `(${stagedFiles.length} staged)` : 'All Changes'}</span>
              </button>
            </form>
          </>
        )}
      </aside>

      {/* ── Main Panel ── */}
      <section className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Top Header */}
        <header className="flex h-11 items-center justify-between border-b border-wb-border px-4 bg-wb-sidepanel/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5 text-xs">
              <button
                onClick={() => dispatch(setGitTab('changes'))}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium ${
                  git.activeTab === 'changes' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span>Diff View</span>
              </button>
              <button
                onClick={() => {
                  dispatch(setGitTab('history'))
                  void run({ action: 'log' })
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium ${
                  git.activeTab === 'history' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>History</span>
              </button>
            </div>
            {git.activeTab === 'changes' && selectedDiff && (
              <div className="flex items-center gap-2 truncate text-xs font-mono text-muted-foreground">
                <span className="truncate font-semibold text-foreground">{selectedDiff.path}</span>
                <span className="text-emerald-500 font-bold">+{selectedDiff.additions}</span>
                <span className="text-rose-500 font-bold">-{selectedDiff.deletions}</span>
              </div>
            )}
          </div>

          {/* Sync / Remote Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void run({ action: 'fetch' })}
              title="Fetch remote changes"
              className="flex items-center gap-1 rounded-md border border-wb-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <Download className="h-3 w-3" /> Fetch
            </button>
            <button
              onClick={() => void run({ action: 'pull', branch: git.status?.branch })}
              title="Pull latest branch changes"
              className="flex items-center gap-1 rounded-md border border-wb-border px-2.5 py-1 text-xs hover:bg-muted"
            >
              <ArrowDown className="h-3 w-3" /> Pull
            </button>
            <button
              onClick={() => void run({ action: 'push', branch: git.status?.branch })}
              title="Push commits to remote"
              className="flex items-center gap-1 rounded-md bg-accent-brand px-3 py-1 text-xs font-medium text-white shadow-xs hover:opacity-90"
            >
              <Upload className="h-3 w-3" /> Push
            </button>
          </div>
        </header>

        {/* Notices */}
        {git.error && (
          <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-500 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{git.error}</span>
          </div>
        )}
        {git.approvalId && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>Push paused for approval · ID: {git.approvalId}</span>
          </div>
        )}

        {/* Main Content Area: Diff vs History */}
        <div className="flex-1 overflow-auto">
          {git.activeTab === 'changes' ? (
            selectedDiff ? (
              <div className="py-3">
                {selectedDiff.patch.split('\n').map((line, idx) => renderDiffLine(line, idx))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <GitBranch className="h-10 w-10 stroke-[1.2] opacity-30 mb-3" />
                <p className="text-sm font-medium">
                  {git.projectId ? 'Select a modified file to inspect its visual diff' : 'Connect or select a project to get started'}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
                  Stage files with the (+) button, review additions & deletions, and commit with message.
                </p>
              </div>
            )
          ) : (
            /* History Tab */
            <div className="p-4 max-w-4xl space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Recent Commits (git log)
              </div>
              <div className="divide-y divide-wb-border rounded-lg border border-wb-border overflow-hidden bg-card">
                {(git.commitLogs ?? []).map((commit) => (
                  <div key={commit.hash} className="flex items-start justify-between p-3 text-xs hover:bg-muted/40 transition-colors">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-semibold text-foreground text-sm leading-tight">{commit.message}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{commit.author}</span>
                        <span>•</span>
                        <span>{commit.date}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(commit.hash)
                        setCopiedHash(commit.hash)
                        setTimeout(() => setCopiedHash(null), 1500)
                      }}
                      title="Copy full commit SHA"
                      className="ml-4 flex items-center gap-1 rounded border border-wb-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      <span>{commit.hash.slice(0, 7)}</span>
                      <Copy className="h-2.5 w-2.5" />
                      {copiedHash === commit.hash && <span className="text-emerald-500 font-sans">Copied!</span>}
                    </button>
                  </div>
                ))}
                {(git.commitLogs ?? []).length === 0 && (
                  <div className="p-8 text-center text-xs text-muted-foreground">No commits loaded yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Clone / Import Repository Modal ── */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-wb-border bg-card p-6 shadow-2xl text-card-foreground">
            <div className="flex items-start justify-between pb-3 mb-4 border-b border-wb-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-brand/10 text-accent-brand">
                  <GitPullRequest className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Clone / Import Repository</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Import an open-source or private Git repository directly into your workspace.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!isCloning && !isProbing) {
                    setIsCloneModalOpen(false)
                    setCloneError(null)
                    setCloneNotice(null)
                  }
                }}
                disabled={isCloning || isProbing}
                className="rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleStartClone} className="space-y-4">
              {/* Repository URL */}
              <div>
                <label className="block text-xs font-medium mb-1">
                  Repository URL <span className="text-rose-500">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={cloneUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://github.com/owner/repository.git"
                  className="h-8 w-full rounded-md border border-wb-border bg-background px-2.5 text-xs font-mono outline-none focus:border-accent-brand"
                />
              </div>

              {/* Project Name */}
              <div>
                <label className="block text-xs font-medium mb-1">Project Name</label>
                <input
                  value={cloneProjectName}
                  onChange={(e) => setCloneProjectName(e.target.value)}
                  placeholder="my-project"
                  className="h-8 w-full rounded-md border border-wb-border bg-background px-2.5 text-xs outline-none focus:border-accent-brand"
                />
              </div>

              {/* Destination Directory */}
              <div>
                <label className="block text-xs font-medium mb-1">
                  Destination Directory <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    required
                    value={cloneDestination}
                    onChange={(e) => setCloneDestination(e.target.value)}
                    placeholder="C:\Projects\my-project"
                    className="h-8 flex-1 rounded-md border border-wb-border bg-background px-2.5 text-xs font-mono outline-none focus:border-accent-brand"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseCloneFolder}
                    title="Browse destination folder"
                    className="flex h-8 items-center gap-1.5 rounded-md border border-wb-border bg-background px-2.5 text-xs hover:bg-muted"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              {/* Private Repository / Access Token Section */}
              {showTokenInput && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>Personal Access Token (PAT) Required</span>
                  </div>
                  {cloneNotice && <p className="text-[11px] text-muted-foreground">{cloneNotice}</p>}
                  <div className="relative">
                    <input
                      type={showTokenSecret ? 'text' : 'password'}
                      value={cloneToken}
                      onChange={(e) => setCloneToken(e.target.value)}
                      placeholder="ghp_... or glpat-... or token"
                      className="h-8 w-full rounded-md border border-wb-border bg-background pl-2.5 pr-8 text-xs font-mono outline-none focus:border-accent-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTokenSecret((v) => !v)}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {showTokenSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Tokens are used for secure transport only and never stored in the database.
                  </p>
                </div>
              )}

              {/* Notice / Error Feedback */}
              {cloneError && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{cloneError}</span>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-wb-border">
                <button
                  type="button"
                  disabled={isCloning || isProbing}
                  onClick={() => {
                    setIsCloneModalOpen(false)
                    setCloneError(null)
                    setCloneNotice(null)
                  }}
                  className="h-8 rounded-md border border-wb-border px-3 text-xs hover:bg-muted disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!cloneUrl.trim() || !cloneDestination.trim() || isCloning || isProbing}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-accent-brand px-4 text-xs font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-40"
                >
                  {(isCloning || isProbing) && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isCloning
                      ? 'Cloning Repository…'
                      : isProbing
                      ? 'Analyzing Repository…'
                      : showTokenInput
                      ? 'Authenticate & Clone'
                      : 'Clone Repository'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
