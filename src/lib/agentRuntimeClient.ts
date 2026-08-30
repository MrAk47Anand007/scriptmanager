export type AgentProvider = 'codex' | 'claude'
export type AgentAccessLevel = 'observe' | 'develop' | 'full'

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

async function readJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(data.error ?? 'Agent request failed')
  return data
}

export async function listAgentProfilesRuntime(): Promise<AgentProfileRuntime[]> {
  if (window.scriptManagerDesktop?.runtime?.listAgentProfiles) {
    return window.scriptManagerDesktop.runtime.listAgentProfiles() as Promise<AgentProfileRuntime[]>
  }
  const response = await fetch('/api/agents/profiles')
  return readJsonResponse(response) as Promise<AgentProfileRuntime[]>
}

export async function createAgentProfileRuntime(payload: AgentProfilePayload): Promise<AgentProfileRuntime> {
  if (window.scriptManagerDesktop?.runtime?.createAgentProfile) {
    return window.scriptManagerDesktop.runtime.createAgentProfile(payload) as Promise<AgentProfileRuntime>
  }

  const providerResponse = await fetch('/api/agents/providers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: payload.provider,
      name: `${payload.name} provider`,
      executable: payload.provider === 'codex' ? 'codex-acp' : 'claude-agent-acp',
    }),
  })
  const provider = await readJsonResponse(providerResponse) as { id: string }
  const response = await fetch('/api/agents/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, providerConfigId: provider.id }),
  })
  return readJsonResponse(response) as Promise<AgentProfileRuntime>
}

export async function listAgentRunsRuntime(): Promise<AgentRunRuntime[]> {
  if (window.scriptManagerDesktop?.runtime?.listAgentRuns) {
    return window.scriptManagerDesktop.runtime.listAgentRuns() as Promise<AgentRunRuntime[]>
  }
  const response = await fetch('/api/agents/runs')
  return readJsonResponse(response) as Promise<AgentRunRuntime[]>
}

export async function readAgentRunRuntime(id: string): Promise<AgentRunDetailRuntime> {
  if (window.scriptManagerDesktop?.runtime?.readAgentRun) {
    return window.scriptManagerDesktop.runtime.readAgentRun(id) as Promise<AgentRunDetailRuntime>
  }
  const response = await fetch(`/api/agents/runs/${encodeURIComponent(id)}`)
  return readJsonResponse(response) as Promise<AgentRunDetailRuntime>
}

export async function createAgentRunRuntime(payload: AgentRunPayload): Promise<AgentRunRuntime> {
  if (window.scriptManagerDesktop?.runtime?.createAgentRun) {
    return window.scriptManagerDesktop.runtime.createAgentRun(payload) as Promise<AgentRunRuntime>
  }
  const response = await fetch('/api/agents/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJsonResponse(response) as Promise<AgentRunRuntime>
}

export async function appendAgentMessageRuntime(id: string, message: { role: string; content: string }) {
  if (window.scriptManagerDesktop?.runtime?.appendAgentMessage) {
    return window.scriptManagerDesktop.runtime.appendAgentMessage({ id, ...message })
  }
  const response = await fetch(`/api/agents/runs/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  })
  return readJsonResponse(response)
}

export async function updateAgentRunRuntime(id: string, status: 'interrupted' | 'running' | 'failed') {
  if (window.scriptManagerDesktop?.runtime?.updateAgentRun) {
    return window.scriptManagerDesktop.runtime.updateAgentRun({ id, status })
  }
  if (status === 'failed') throw new Error('Failed agent runs require the desktop runtime')
  const path = status === 'interrupted' ? 'interrupt' : 'resume'
  const response = await fetch(`/api/agents/runs/${encodeURIComponent(id)}/${path}`, {
    method: 'POST',
  })
  return readJsonResponse(response)
}
