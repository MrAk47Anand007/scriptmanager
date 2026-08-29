import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { listProjects, listServerProfiles, saveProject, saveServerProfile } from '../../electron/opsRuntime'

let foreignWorkspaceId = ''
let foreignProjectId = ''
let foreignProfileId = ''

describe('desktop operations workspace isolation', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    foreignWorkspaceId = crypto.randomUUID()
    foreignProjectId = crypto.randomUUID()
    foreignProfileId = crypto.randomUUID()
    await prisma.workspace.create({ data: { id: foreignWorkspaceId, name: 'Foreign', slug: `foreign-${foreignWorkspaceId.slice(0, 8)}`, createdBy: 'other-user' } })
    await prisma.project.create({ data: { id: foreignProjectId, workspaceId: foreignWorkspaceId, name: 'Foreign project' } })
    await prisma.serverProfile.create({ data: { id: foreignProfileId, workspaceId: foreignWorkspaceId, name: 'Foreign server', host: 'foreign.example', username: 'other-user' } })
  })

  afterEach(async () => {
    await prisma.serverProfile.delete({ where: { id: foreignProfileId } }).catch(() => undefined)
    await prisma.project.delete({ where: { id: foreignProjectId } }).catch(() => undefined)
    await prisma.workspace.delete({ where: { id: foreignWorkspaceId } }).catch(() => undefined)
  })

  it('hides and refuses to mutate projects outside the desktop workspace', async () => {
    const projects = await listProjects()
    expect(projects.some((project) => project.id === foreignProjectId)).toBe(false)
    await expect(saveProject({ id: foreignProjectId, name: 'Tampered project' })).rejects.toThrow('Project not found')

    const profiles = await listServerProfiles()
    expect(profiles.some((profile) => profile.id === foreignProfileId)).toBe(false)
    await expect(saveServerProfile({ id: foreignProfileId, name: 'Tampered server' })).rejects.toThrow('Server profile not found')
  })
})
