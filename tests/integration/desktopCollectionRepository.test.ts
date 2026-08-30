import crypto from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/db'
import { ensureDefaultWorkspace } from '@/lib/rbac/bootstrap'
import { createDesktopCollectionRepository } from '@/lib/runtime/desktopCollectionRepository'

describe('desktop collection repository workspace isolation', () => {
  beforeEach(async () => {
    await ensureDefaultWorkspace(prisma)
    await prisma.script.deleteMany()
    await prisma.collection.deleteMany()
  })

  it('hides foreign collections and rejects foreign subtree roots', async () => {
    const localId = `local_collection_${crypto.randomUUID()}`
    const foreignId = `foreign_collection_${crypto.randomUUID()}`
    await prisma.collection.create({ data: { id: localId, workspaceId: 'default', name: 'Local collection' } })
    await prisma.collection.create({ data: { id: foreignId, workspaceId: 'foreign-workspace', name: 'Foreign collection' } })

    const repository = createDesktopCollectionRepository(prisma, 'default')

    expect((await repository.list()).map((collection) => collection.id)).toEqual([localId])
    expect(await repository.get(foreignId)).toBeNull()
    await expect(repository.getSubtree(foreignId)).rejects.toThrow('Collection not found')
  })

  it('forces the trusted workspace on collection creation and parent lookup', async () => {
    const parent = await prisma.collection.create({ data: { workspaceId: 'default', name: 'Parent' } })
    const repository = createDesktopCollectionRepository(prisma, 'default')

    const child = await repository.create({ name: 'Child', parentId: parent.id })

    expect(child.workspaceId).toBe('default')
    expect((await repository.getParent(parent.id))?.id).toBe(parent.id)
    expect(await repository.getParent('missing')).toBeNull()
  })
})
