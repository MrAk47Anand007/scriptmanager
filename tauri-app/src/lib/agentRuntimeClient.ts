export type AgentProvider = 'codex' | 'claude'
export type AgentAccessLevel = 'observe' | 'develop' | 'full'

export type AgentProviderDiscovery = {
  provider: AgentProvider
  available: boolean
  executable?: string
  version?: string
  error?: string
}

export type AgentProfileRuntime = {
  id: string
  name: string
  provider: AgentProvider
  accessLevel: AgentAccessLevel
  projectId?: string | null
  model?: string | null
}

export type AgentRunRuntime = {
  id: string
  profileId: string
  status: string
  provider: string
  createdAt: string
  profile?: AgentProfileRuntime
}

export type AgentRunDetailRuntime = AgentRunRuntime & {
  messages: Array<{ id: string; role: string; content: string }>
  artifacts: Array<{ id: string; kind: string; name: string; content?: string | null }>
  usageJson?: string | null
}

type AgentProfilePayload = {
  name: string
  provider: AgentProvider
  accessLevel: AgentAccessLevel
  projectId?: string | null
}

type AgentRunPayload = {
  profileId: string
  prompt: string
  cwd: string
}

export async function discoverAgentProvidersRuntime(): Promise<AgentProviderDiscovery[]> {
  if (window.scriptManagerDesktop?.agents?.discover) {
    return window.scriptManagerDesktop.agents.discover() as Promise<AgentProviderDiscovery[]>
  }
  return []
}

export async function launchAgentRuntime(payload: AgentRunPayload): Promise<AgentRunRuntime> {
  if (window.scriptManagerDesktop?.agents?.run) {
    return window.scriptManagerDesktop.agents.run(payload) as Promise<AgentRunRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function interruptAgentRuntime(id: string): Promise<unknown> {
  if (window.scriptManagerDesktop?.agents?.interruptRun) return window.scriptManagerDesktop.agents.interruptRun(id)
  return updateAgentRunRuntime(id, 'interrupted')
}

export async function resumeAgentRuntime(id: string, prompt: string): Promise<unknown> {
  if (window.scriptManagerDesktop?.agents?.resumeRun) return window.scriptManagerDesktop.agents.resumeRun({ runId: id, prompt })
  return updateAgentRunRuntime(id, 'running')
}

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Agent request failed')
  return data
}

export async function listAgentProfilesRuntime(): Promise<AgentProfileRuntime[]> {
  if (window.scriptManagerDesktop?.runtime?.listAgentProfiles) {
    return window.scriptManagerDesktop.runtime.listAgentProfiles() as Promise<AgentProfileRuntime[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function createAgentProfileRuntime(payload: AgentProfilePayload): Promise<AgentProfileRuntime> {
  if (window.scriptManagerDesktop?.runtime?.createAgentProfile) {
    return window.scriptManagerDesktop.runtime.createAgentProfile(payload) as Promise<AgentProfileRuntime>
  }

  throw new Error('Desktop runtime unavailable')
}

export async function listAgentRunsRuntime(): Promise<AgentRunRuntime[]> {
  if (window.scriptManagerDesktop?.runtime?.listAgentRuns) {
    return window.scriptManagerDesktop.runtime.listAgentRuns() as Promise<AgentRunRuntime[]>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function readAgentRunRuntime(id: string): Promise<AgentRunDetailRuntime> {
  if (window.scriptManagerDesktop?.runtime?.readAgentRun) {
    return window.scriptManagerDesktop.runtime.readAgentRun(id) as Promise<AgentRunDetailRuntime>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function updateAgentRunRuntime(id: string, status: 'interrupted' | 'running' | 'failed') {
  if (status === 'failed') throw new Error('Failed agent runs require the desktop runtime')
  const path = status === 'interrupted' ? 'interrupt' : 'resume'
  throw new Error('Desktop runtime unavailable')
}
