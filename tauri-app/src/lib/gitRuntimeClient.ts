import axios from 'axios'
import type { GitAction } from './git/types'

export async function runGitActionRuntime(projectId: string, action: GitAction) {
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
