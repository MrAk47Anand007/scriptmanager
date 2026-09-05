type CreateInvitationPayload = { email: string; roleId: string }
type CreateRolePayload = { name: string; permissions: string[] }

export async function loadWorkspaceAccessRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listWorkspaceAccess) {
    return window.scriptManagerDesktop.runtime.listWorkspaceAccess()
  }

  throw new Error('Desktop runtime unavailable')
}

export async function createWorkspaceInvitationRuntime(_payload: CreateInvitationPayload) {
  if (window.scriptManagerDesktop?.runtime?.createWorkspaceInvitation) {
    return window.scriptManagerDesktop.runtime.createWorkspaceInvitation(_payload)
  }

  throw new Error('Desktop runtime unavailable')
}

export async function revokeWorkspaceGrantsRuntime(actorId?: string) {
  if (window.scriptManagerDesktop?.runtime?.revokeWorkspaceGrants) {
    return window.scriptManagerDesktop.runtime.revokeWorkspaceGrants(actorId ? { actorId } : {})
  }

  throw new Error('Desktop runtime unavailable')
}

export async function createWorkspaceRoleRuntime(payload: CreateRolePayload) {
  if (window.scriptManagerDesktop?.runtime?.createWorkspaceRole) {
    return window.scriptManagerDesktop.runtime.createWorkspaceRole(payload)
  }

  throw new Error('Desktop runtime unavailable')
}
