import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { createGithubGistCredentialService } from './gistCredentials'
import { createSecretVaultService } from './secrets/service'
import { createServerSecretStore } from './secrets/serverStore'

interface ScriptForGist {
  id: string
  name: string
  workspaceId?: string
  gistId?: string | null
  gistFilename?: string | null
  collection?: { name: string } | null
}

type SecretVaultService = ReturnType<typeof createSecretVaultService>
export type GistServiceOptions = { vault?: SecretVaultService; workspaceId?: string; actorId?: string }

function calculateGistFilename(scriptName: string, collectionName?: string): string {
  if (collectionName) {
    const safe = collectionName.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/ /g, '_')
    return `${safe}_${scriptName}`
  }
  return scriptName
}

export function createGistService(
  database: PrismaClient = prisma,
  options: GistServiceOptions = {},
) {
  const vault = options.vault ?? createSecretVaultService(database, createServerSecretStore())
  const credentials = createGithubGistCredentialService(database, vault)

  async function getGithubToken(script: ScriptForGist) {
    return credentials.resolveToken({
      workspaceId: script.workspaceId ?? options.workspaceId ?? 'default',
      actorId: options.actorId,
    })
  }

  async function syncScriptToGist(script: ScriptForGist, content: string): Promise<{ gist_id: string; gist_url: string; gist_filename: string }> {
    const token = await getGithubToken(script)
    const newFilename = calculateGistFilename(script.name, script.collection?.name ?? undefined)
    const oldFilename = script.gistFilename

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ScriptManager/1.0',
    }

    let resp: Response

    if (script.gistId) {
      const files: Record<string, { content: string } | null> = {
        [newFilename]: { content },
      }
      if (oldFilename && oldFilename !== newFilename) {
        files[oldFilename] = null
      }

      resp = await fetch(`https://api.github.com/gists/${encodeURIComponent(script.gistId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ description: `Script: ${script.name}`, files }),
      })
    } else {
      resp = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          description: `Script: ${script.name}`,
          public: false,
          files: { [newFilename]: { content } },
        }),
      })
    }

    if (!resp.ok) {
      const errText = (await resp.text()).slice(0, 500)
      throw new Error(`GitHub Gist API error (${resp.status}): ${errText}`)
    }

    const data = await resp.json() as { id: string; html_url: string }
    await database.script.update({
      where: { id: script.id },
      data: { gistId: data.id, gistUrl: data.html_url, gistFilename: newFilename, syncToGist: true },
    })

    return { gist_id: data.id, gist_url: data.html_url, gist_filename: newFilename }
  }

  async function deleteGistFromGitHub(gistId: string, workspaceId = options.workspaceId ?? 'default'): Promise<void> {
    const token = await credentials.resolveToken({ workspaceId, actorId: options.actorId })
    const resp = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ScriptManager/1.0',
      },
    })

    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Failed to delete Gist: ${resp.status} ${resp.statusText}`)
    }
  }

  return { syncScriptToGist, deleteGistFromGitHub }
}

export async function syncScriptToGist(script: ScriptForGist, content: string, options: GistServiceOptions = {}) {
  return createGistService(prisma, options).syncScriptToGist(script, content)
}

export async function deleteGistFromGitHub(gistId: string, options: GistServiceOptions = {}) {
  return createGistService(prisma, options).deleteGistFromGitHub(gistId, options.workspaceId)
}
