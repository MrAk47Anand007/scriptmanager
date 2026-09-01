export async function listPluginsRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listPlugins) {
    return window.scriptManagerDesktop.runtime.listPlugins()
  }
  const response = await fetch('/api/plugins')
  if (!response.ok) {
    throw new Error('Unable to load plugins')
  }
  return response.json()
}

export async function updatePluginRuntime(id: string, action: string, payload: Record<string, unknown> = {}) {
  if (window.scriptManagerDesktop?.runtime?.updatePlugin) {
    return window.scriptManagerDesktop.runtime.updatePlugin({ id, action, ...payload })
  }
  const response = await fetch(`/api/plugins/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  if (!response.ok) {
    throw new Error((await response.json()).error ?? 'Plugin update failed')
  }
  return response.json()
}

export async function removePluginRuntime(id: string) {
  if (window.scriptManagerDesktop?.runtime?.removePlugin) {
    return window.scriptManagerDesktop.runtime.removePlugin(id)
  }
  const response = await fetch(`/api/plugins/${id}`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    throw new Error((await response.json()).error ?? 'Plugin uninstall failed')
  }
}
