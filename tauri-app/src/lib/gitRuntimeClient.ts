import axios from 'axios'
import type { GitAction } from './git/types'
import { invokeTauri } from '@/lib/tauriInvoke'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'

function isTauri(): boolean {
  return isDesktopRenderer()
}

export async function runGitActionRuntime(projectId: string, action: GitAction) {
  if (isTauri()) {
    return invokeTauri('run_git_action', { payload: { projectId, action } })
  }
  if (window.scriptManagerDesktop?.runtime?.runGitAction) {
    return window.scriptManagerDesktop.runtime.runGitAction({ projectId, action })
  }

  const response = await axios.post(`/api/projects/${projectId}/git`, action, {
    validateStatus: status => status < 500,
  })
  if (response.status >= 400) {
    const message = response.data && typeof response.data.error === 'string'
      ? response.data.error
      : 'Git operation failed'
    throw new Error(message)
  }
  return response.data
}

export async function probeGitRepoRuntime(payload: { url: string; token?: string }) {
  if (isTauri()) {
    return invokeTauri('git_probe', { url: payload.url, token: payload.token ?? null })
  }
  const response = await axios.post('/api/git/probe', payload)
  return response.data
}

export async function cloneGitRepoRuntime(payload: {
  url: string
  targetPath: string
  token?: string
  projectName?: string
  branch?: string
}) {
  if (isTauri()) {
    return invokeTauri('git_clone_project', { payload })
  }
  const response = await axios.post('/api/git/clone', payload)
  return response.data
}
