import type { Prisma, PrismaClient } from '@prisma/client'

export type DesktopCollectionRecord = Prisma.CollectionGetPayload<{
  include: { _count: { select: { scripts: true } } }
}>

type CollectionCreateData = Omit<Prisma.CollectionUncheckedCreateInput, 'workspaceId'>

const collectionWithScriptCount = {
  _count: { select: { scripts: true } },
} as const

export function createDesktopCollectionRepository(database: PrismaClient, workspaceId: string) {
  const where = (id?: string) => id ? { id, workspaceId } : { workspaceId }

  return {
    list(): Promise<DesktopCollectionRecord[]> {
      return database.collection.findMany({
        where: where(),
        orderBy: { name: 'asc' },
        include: collectionWithScriptCount,
      })
    },

    get(id: string): Promise<DesktopCollectionRecord | null> {
      return database.collection.findFirst({
        where: where(id),
        include: collectionWithScriptCount,
      })
    },

    getParent(parentId: string | null | undefined): Promise<DesktopCollectionRecord | null> {
      if (!parentId) return Promise.resolve(null)
      return database.collection.findFirst({
        where: where(parentId),
        include: collectionWithScriptCount,
      })
    },

    async getSubtree(rootCollectionId: string): Promise<DesktopCollectionRecord[]> {
      const collections = await database.collection.findMany({
        where: where(),
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        include: collectionWithScriptCount,
      })
      const root = collections.find((collection) => collection.id === rootCollectionId)
      if (!root) throw new Error('Collection not found')

      const childrenByParentId = new Map<string | null, DesktopCollectionRecord[]>()
      for (const collection of collections) {
        const siblings = childrenByParentId.get(collection.parentId ?? null) ?? []
        siblings.push(collection)
        childrenByParentId.set(collection.parentId ?? null, siblings)
      }

      const subtree: DesktopCollectionRecord[] = []
      const stack: DesktopCollectionRecord[] = [root]
      while (stack.length > 0) {
        const current = stack.pop()!
        subtree.push(current)
        const children = childrenByParentId.get(current.id) ?? []
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push(children[index]!)
        }
      }

      return subtree
    },

    findByFolder(folderPath: string): Promise<DesktopCollectionRecord | null> {
      return database.collection.findFirst({
        where: { workspaceId, folderPath },
        include: collectionWithScriptCount,
      })
    },

    findByName(name: string): Promise<DesktopCollectionRecord | null> {
      return database.collection.findFirst({
        where: { workspaceId, name },
        include: collectionWithScriptCount,
      })
    },

    create(data: CollectionCreateData): Promise<DesktopCollectionRecord> {
      return database.collection.create({
        data: { ...data, workspaceId },
        include: collectionWithScriptCount,
      })
    },
  }
}
