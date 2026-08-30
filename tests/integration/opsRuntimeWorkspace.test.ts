import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { listApiCollections, saveApiCollection } from '../../electron/apiRuntime'
import { assignCollectionToProject, listProjects, listServerProfiles, saveProject, saveServerProfile } from '../../electron/opsRuntime'

let foreignWorkspaceId = ''
let foreignProjectId = ''
let foreignProfileId = ''
let foreignApiCollectionId = ''
let foreignCollectionId = ''
let localProjectId = ''

describe('desktop operations workspace isolation', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    foreignWorkspaceId = crypto.randomUUID()
    foreignProjectId = crypto.randomUUID()
    foreignProfileId = crypto.randomUUID()
    foreignApiCollectionId = `foreign_api_${crypto.randomUUID()}`
    foreignCollectionId = crypto.randomUUID()
    localProjectId = crypto.randomUUID()
    await prisma.workspace.create({ data: { id: foreignWorkspaceId, name: 'Foreign', slug: `foreign-${foreignWorkspaceId.slice(0, 8)}`, createdBy: 'other-user' } })
    await prisma.project.create({ data: { id: foreignProjectId, workspaceId: foreignWorkspaceId, name: 'Foreign project' } })
    await prisma.serverProfile.create({ data: { id: foreignProfileId, workspaceId: foreignWorkspaceId, name: 'Foreign server', host: 'foreign.example', username: 'other-user' } })
    await prisma.apiCollection.create({ data: { id: foreignApiCollectionId, workspaceId: foreignWorkspaceId, name: 'Foreign API collection' } })
    await prisma.collection.create({ data: { id: foreignCollectionId, workspaceId: foreignWorkspaceId, name: 'Foreign scripts' } })
    await prisma.project.create({ data: { id: localProjectId, workspaceId: 'default', name: 'Local project' } })
  })

  afterEach(async () => {
    await prisma.serverProfile.delete({ where: { id: foreignProfileId } }).catch(() => undefined)
    await prisma.apiCollection.delete({ where: { id: foreignApiCollectionId } }).catch(() => undefined)
    await prisma.collection.delete({ where: { id: foreignCollectionId } }).catch(() => undefined)
    await prisma.project.delete({ where: { id: localProjectId } }).catch(() => undefined)
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

    const apiCollections = await listApiCollections()
    expect(apiCollections.some((collection) => collection.id === foreignApiCollectionId)).toBe(false)
    await expect(saveApiCollection({ id: foreignApiCollectionId, name: 'Tampered API collection' })).rejects.toThrow('Collection not found')
  })

  it('refuses to assign a foreign collection to a local project', async () => {
    await expect(assignCollectionToProject(foreignCollectionId, localProjectId)).rejects.toThrow('Collection not found')
    expect((await prisma.collection.findUniqueOrThrow({ where: { id: foreignCollectionId } })).projectId).toBeNull()
  })
})
