import { prisma } from '@/lib/db'

interface ScriptForGist {
  id: string
  name: string
  gistId?: string | null
  gistFilename?: string | null
  collection?: { name: string } | null
}

async function getGithubToken(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: 'github_token' } })
  if (!setting?.value) {
    throw new Error('No GitHub token configured. Please set your GitHub token in Settings.')
  }
  return setting.value
}

function calculateGistFilename(scriptName: string, collectionName?: string): string {
  if (collectionName) {
    const safe = collectionName.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/ /g, '_')
    return `${safe}_${scriptName}`
  }
  return scriptName
}

export async function syncScriptToGist(script: ScriptForGist, content: string): Promise<{ gist_id: string; gist_url: string; gist_filename: string }> {
  const token = await getGithubToken()
  const newFilename = calculateGistFilename(script.name, script.collection?.name ?? undefined)
  const oldFilename = script.gistFilename

  const headers: Record<string, string> = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'ScriptManager/1.0'
  }

  let resp: Response

  if (script.gistId) {
    // PATCH existing gist
    const files: Record<string, { content: string } | null> = {
      [newFilename]: { content }
    }
    if (oldFilename && oldFilename !== newFilename) {
      files[oldFilename] = null // Delete old filename in gist
    }

    resp = await fetch(`https://api.github.com/gists/${script.gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: `Script: ${script.name}`,
        files
      })
    })
  } else {
    // POST new gist
    resp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: `Script: ${script.name}`,
        public: false,
        files: { [newFilename]: { content } }
      })
    })
  }

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`GitHub Gist API error (${resp.status}): ${errText}`)
  }

  const data = await resp.json() as { id: string; html_url: string }

  await prisma.script.update({
    where: { id: script.id },
    data: {
      gistId: data.id,
      gistUrl: data.html_url,
      gistFilename: newFilename,
      syncToGist: true
    }
  })

  return { gist_id: data.id, gist_url: data.html_url, gist_filename: newFilename }
}

export async function deleteGistFromGitHub(gistId: string): Promise<void> {
  const token = await getGithubToken()

  const resp = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ScriptManager/1.0'
    }
  })

  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Failed to delete Gist: ${resp.status} ${resp.statusText}`)
  }
}
