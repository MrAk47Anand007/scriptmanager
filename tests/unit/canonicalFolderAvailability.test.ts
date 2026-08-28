import { describe, expect, it } from 'vitest'
import { getCanonicalFolderAvailability } from '../../electron/canonicalFolderRuntime'

describe('canonical folder availability', () => {
  it('reports a missing linked folder as unavailable', async () => {
    await expect(getCanonicalFolderAvailability('/missing/scriptmanager-folder', 'collection-1')).resolves.toMatchObject({
      collectionId: 'collection-1',
      available: false,
      reason: 'missing',
    })
  })
})
