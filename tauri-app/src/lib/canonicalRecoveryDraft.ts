import path from 'node:path'

export type CanonicalRecoveryDraftInput = {
  scriptId: string
  sourcePath: string
  sourceRevision: string
  content: string
}

export function normalizeCanonicalRecoveryDraftInput(input: unknown, canonicalSourcePath: string): CanonicalRecoveryDraftInput {
  if (!input || typeof input !== 'object') throw new Error('Invalid recovery draft payload')
  const payload = input as Partial<CanonicalRecoveryDraftInput>
  if (typeof payload.scriptId !== 'string' || !payload.scriptId.trim()) throw new Error('Recovery draft script id is required')
  if (typeof payload.sourcePath !== 'string' || !payload.sourcePath.trim()) throw new Error('Recovery draft source path is required')
  if (typeof payload.sourceRevision !== 'string') throw new Error('Recovery draft source revision is required')
  if (typeof payload.content !== 'string') throw new Error('Recovery draft content is required')

  const expectedPath = path.resolve(canonicalSourcePath)
  if (path.resolve(payload.sourcePath) !== expectedPath) {
    throw new Error('Recovery draft canonical source path does not match the authorized script')
  }

  return {
    scriptId: payload.scriptId,
    sourcePath: expectedPath,
    sourceRevision: payload.sourceRevision,
    content: payload.content,
  }
}
