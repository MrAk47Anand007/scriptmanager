import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]+$/

function assertSafeIdentifier(value: string, label: 'script' | 'draft'): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(label === 'script' ? 'Invalid recovery draft script id' : 'Invalid recovery draft id')
  }
}

export type RecoveryDraftInput = {
  scriptId: string
  sourcePath: string
  sourceRevision: string
  content: string
}

export type RecoveryDraft = RecoveryDraftInput & {
  id: string
  createdAt: string
}

export function createRecoveryDraftStore({ rootDir }: { rootDir: string }) {
  const draftDirectory = (scriptId: string) => {
    assertSafeIdentifier(scriptId, 'script')
    return path.join(rootDir, 'recovery-drafts', scriptId)
  }
  const draftPath = (scriptId: string, draftId: string) => {
    assertSafeIdentifier(draftId, 'draft')
    return path.join(draftDirectory(scriptId), `${draftId}.json`)
  }

  const findDraftPath = async (draftId: string) => {
    assertSafeIdentifier(draftId, 'draft')
    const root = path.join(rootDir, 'recovery-drafts')
    const scriptDirectories = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const directory of scriptDirectories) {
      if (!directory.isDirectory()) continue
      if (!SAFE_IDENTIFIER.test(directory.name)) continue
      const candidate = draftPath(directory.name, draftId)
      if (await fs.promises.stat(candidate).then(() => true).catch(() => false)) return candidate
    }
    throw new Error('Recovery draft not found')
  }

  return {
    async save(input: RecoveryDraftInput): Promise<RecoveryDraft> {
      const draft: RecoveryDraft = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
      await fs.promises.mkdir(draftDirectory(input.scriptId), { recursive: true })
      await fs.promises.writeFile(draftPath(input.scriptId, draft.id), JSON.stringify(draft), { encoding: 'utf8', mode: 0o600 })
      return draft
    },

    async read(draftId: string): Promise<RecoveryDraft> {
      return JSON.parse(await fs.promises.readFile(await findDraftPath(draftId), 'utf8')) as RecoveryDraft
    },

    async list(scriptId: string): Promise<RecoveryDraft[]> {
      const files = await fs.promises.readdir(draftDirectory(scriptId)).catch(() => [])
      const drafts = await Promise.all(files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => JSON.parse(await fs.promises.readFile(path.join(draftDirectory(scriptId), file), 'utf8')) as RecoveryDraft))
      return drafts.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    },

    async discard(draftId: string): Promise<void> {
      await fs.promises.rm(await findDraftPath(draftId))
    },
  }
}
