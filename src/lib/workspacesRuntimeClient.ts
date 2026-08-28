type CreateInvitationPayload = { email: string; roleId: string }
type CreateRolePayload = { name: string; permissions: string[] }

export async function loadWorkspaceAccessRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listWorkspaceAccess) {
    return window.scriptManagerDesktop.runtime.listWorkspaceAccess()
  }

  const response = await fetch('/api/workspaces/current')
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Could not load workspace access')
  }
  const data = await response.json()
  const [sessionsResponse, auditResponse] = await Promise.all([
    fetch('/api/workspaces/current/sessions'),
    fetch('/api/workspaces/current/audit'),
  ])
  return {
    ...data,
    sessions: sessionsResponse.ok ? await sessionsResponse.json() : [],
    audit: auditResponse.ok ? await auditResponse.json() : [],
  }
}

export async function createWorkspaceInvitationRuntime(payload: CreateInvitationPayload) {
  if (window.scriptManagerDesktop?.runtime?.createWorkspaceInvitation) {
    return window.scriptManagerDesktop.runtime.createWorkspaceInvitation(payload)
  }

  const response = await fetch('/api/workspaces/current/invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Invitation failed')
  }
  return response.json()
}

export async function revokeWorkspaceGrantsRuntime(actorId?: string) {
  if (window.scriptManagerDesktop?.runtime?.revokeWorkspaceGrants) {
    return window.scriptManagerDesktop.runtime.revokeWorkspaceGrants(actorId ? { actorId } : {})
  }

  const response = await fetch('/api/workspaces/current/grants/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(actorId ? { actorId } : {}),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Grant revocation failed')
  }
  return response.json()
}

export async function createWorkspaceRoleRuntime(payload: CreateRolePayload) {
  if (window.scriptManagerDesktop?.runtime?.createWorkspaceRole) {
    return window.scriptManagerDesktop.runtime.createWorkspaceRole(payload)
  }

  const response = await fetch('/api/workspaces/current/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Role creation failed')
  }
  return response.json()
}
