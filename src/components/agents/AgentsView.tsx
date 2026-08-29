'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bot, FolderOpen, Pause, Play, ShieldCheck } from 'lucide-react'
import { listProjectsRuntime } from '@/lib/opsRuntimeClient'
import {
  createAgentProfileRuntime,
  createAgentRunRuntime,
  listAgentProfilesRuntime,
  listAgentRunsRuntime,
  readAgentRunRuntime,
  updateAgentRunRuntime,
} from '@/lib/agentRuntimeClient'

type Profile = { id: string; name: string; provider: 'codex' | 'claude'; accessLevel: 'observe' | 'develop' | 'full'; projectId?: string | null; model?: string | null }
type Project = { id: string; name: string; repository_root: string | null }
type Run = { id: string; profileId: string; status: string; provider: string; createdAt: string; profile?: Profile }
type Detail = Run & { messages: Array<{ id: string; role: string; content: string }>; artifacts: Array<{ id: string; kind: string; name: string; content?: string | null }>; usageJson?: string | null }

export function AgentsView() {
  const desktop = typeof window !== 'undefined' && Boolean(window.__ELECTRON__ && window.scriptManagerDesktop?.agents)
  const [profiles, setProfiles] = useState<Profile[]>([]); const [runs, setRuns] = useState<Run[]>([]); const [detail, setDetail] = useState<Detail | null>(null)
  const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState('')
  const [name, setName] = useState('Developer agent'); const [provider, setProvider] = useState<'codex' | 'claude'>('codex'); const [accessLevel, setAccessLevel] = useState<'observe' | 'develop' | 'full'>('observe')
  const [prompt, setPrompt] = useState('Inspect this workspace and summarize the next useful change.'); const [cwd, setCwd] = useState(''); const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [p, r, j] = await Promise.all([listAgentProfilesRuntime(), listAgentRunsRuntime(), listProjectsRuntime()])
      setProfiles(p)
      setRuns(r)
      setProjects((j as Project[]).filter((item) => item.repository_root))
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Failed to load agents')
    }
  }, [])
  const selectRun = useCallback(async (id: string) => {
    try {
      setDetail(await readAgentRunRuntime(id))
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Failed to load agent run')
    }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const unsubscribe = window.scriptManagerDesktop?.agents?.onEvent(({ sessionId }) => {
      void Promise.all([selectRun(sessionId), load()])
    })
    return unsubscribe
  }, [load, selectRun])
  async function createProfile() {
    setError('')
    try {
      await createAgentProfileRuntime({ name, provider, accessLevel, projectId: projectId || null })
      await load()
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Failed to create agent profile')
    }
  }
  async function chooseFolder() { const selected = await window.scriptManagerDesktop?.selectFolder(); if (selected) setCwd(selected) }
  async function launch(profile: Profile) {
    if (!desktop) return setError('Open ScriptManager Desktop to launch Codex or Claude.')
    const projectRoot = projects.find((item) => item.id === profile.projectId)?.repository_root
    const workspace = projectRoot || cwd
    if (!workspace) return setError('Select a repository project or choose a context folder.')
    setError('')
    let run: Run | null = null
    try {
      run = await createAgentRunRuntime({ profileId: profile.id, prompt, cwd: workspace })
      await window.scriptManagerDesktop!.agents!.launch({ provider: profile.provider, sessionId: run.id, profileId: profile.id, cwd: workspace })
      await window.scriptManagerDesktop!.agents!.input({ sessionId: run.id, message: { role: 'user', content: prompt } })
      await load()
      await selectRun(run.id)
    } catch (value) {
      if (run) await updateAgentRunRuntime(run.id, 'failed').catch(() => undefined)
      setError(value instanceof Error ? value.message : 'Failed to launch agent')
    }
  }
  async function interrupt(run: Run) {
    try {
      await window.scriptManagerDesktop?.agents?.interrupt(run.id)
      await updateAgentRunRuntime(run.id, 'interrupted')
      await load()
      await selectRun(run.id)
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Failed to interrupt agent')
    }
  }
  async function resume(run: Run) {
    try {
      await window.scriptManagerDesktop?.agents?.input({ sessionId: run.id, message: { role: 'user', content: prompt } })
      await updateAgentRunRuntime(run.id, 'running')
      await load()
      await selectRun(run.id)
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Failed to resume agent')
    }
  }
  return <div className="grid h-full grid-cols-[320px_1fr] bg-background text-foreground">
    <aside className="overflow-y-auto border-r border-wb-border bg-wb-sidepanel p-4"><div className="mb-4 flex items-center gap-2"><Bot className="h-5 w-5"/><div><h1 className="font-semibold">Agents</h1><p className="text-xs text-muted-foreground">Codex and Claude via ACP</p></div></div>
      {!desktop && <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"><strong>Desktop host required.</strong><br/>You can inspect runs here, but local providers launch only in ScriptManager Desktop.</div>}
      <div className="space-y-2 rounded border border-wb-border p-3"><div className="text-xs font-semibold uppercase text-muted-foreground">First connection</div><input className="w-full rounded border bg-background px-2 py-1.5 text-sm" value={name} onChange={e=>setName(e.target.value)}/><div className="grid grid-cols-2 gap-2"><select className="rounded border bg-background px-2 py-1.5 text-sm" value={provider} onChange={e=>setProvider(e.target.value as 'codex'|'claude')}><option value="codex">Codex</option><option value="claude">Claude</option></select><select aria-label="Access level" className="rounded border bg-background px-2 py-1.5 text-sm" value={accessLevel} onChange={e=>setAccessLevel(e.target.value as typeof accessLevel)}><option value="observe">Observe</option><option value="develop">Develop</option><option value="full">Full</option></select></div><select aria-label="Repository workspace" value={projectId} onChange={e=>setProjectId(e.target.value)} className="w-full rounded border bg-background px-2 py-1.5 text-sm"><option value="">No repository workspace</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="text-[11px] text-muted-foreground">Full still asks before secrets, push, remote execution, and deployment.</p><button onClick={()=>void createProfile()} className="w-full rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground">Create profile</button></div>
      <div className="mt-4 space-y-2">{profiles.map(profile=><button key={profile.id} onClick={()=>void launch(profile)} className="w-full rounded border border-wb-border p-3 text-left hover:bg-muted"><div className="flex justify-between"><span className="text-sm font-medium">{profile.name}</span><span className="text-[10px] uppercase text-muted-foreground">{profile.provider}</span></div><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3 w-3"/>{profile.accessLevel}</div></button>)}</div>
    </aside>
    <main className="flex min-w-0 flex-col"><div className="border-b border-wb-border p-4"><div className="flex gap-2"><button onClick={()=>void chooseFolder()} className="flex items-center gap-2 rounded border px-3 py-2 text-xs"><FolderOpen className="h-4 w-4"/>{cwd||'Choose context folder'}</button></div><textarea className="mt-3 min-h-20 w-full rounded border bg-background p-3 text-sm" value={prompt} onChange={e=>setPrompt(e.target.value)}/>{error&&<p className="mt-2 text-xs text-red-500">{error}</p>}</div>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr]"><div className="overflow-y-auto border-r border-wb-border p-3"><div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Activity</div>{runs.map(run=><button key={run.id} onClick={()=>void selectRun(run.id)} className="mb-2 w-full rounded border p-2 text-left"><div className="text-xs font-medium">{run.profile?.name??run.provider}</div><div className="text-[11px] text-muted-foreground">{run.status} · {new Date(run.createdAt).toLocaleString()}</div></button>)}</div>
        <div className="overflow-y-auto p-5">{detail?<><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">{detail.profile?.name}</h2><p className="text-xs text-muted-foreground">{detail.status} · correlation {detail.id.slice(0,8)}</p></div><div className="flex gap-2">{detail.status==='running'?<button onClick={()=>void interrupt(detail)} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><Pause className="h-3 w-3"/>Interrupt</button>:<button disabled={!desktop} onClick={()=>void resume(detail)} className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs"><Play className="h-3 w-3"/>Resume</button>}</div></div><div className="space-y-3">{detail.messages.map(message=><div key={message.id} className={`rounded-lg p-3 text-sm ${message.role==='user'?'ml-12 bg-muted':'mr-12 border'}`}><div className="mb-1 text-[10px] uppercase text-muted-foreground">{message.role}</div><div className="whitespace-pre-wrap">{message.content}</div></div>)}</div>{detail.artifacts.length>0&&<section className="mt-6"><h3 className="mb-2 text-sm font-semibold">Artifacts</h3>{detail.artifacts.map(a=><details key={a.id} className="rounded border p-3"><summary className="text-sm">{a.name} · {a.kind}</summary><pre className="mt-2 overflow-auto text-xs">{a.content}</pre></details>)}</section>}{detail.usageJson&&<p className="mt-4 text-xs text-muted-foreground">Usage {detail.usageJson}</p>}</>:<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a run or launch a profile.</div>}</div></div>
    </main>
  </div>
}
