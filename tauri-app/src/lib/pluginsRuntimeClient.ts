export async function listPluginsRuntime() {
  if (window.scriptManagerDesktop?.runtime?.listPlugins) {
    return window.scriptManagerDesktop.runtime.listPlugins()
  }
  throw new Error('Desktop runtime unavailable')
}

export async function updatePluginRuntime(id: string, action: string, payload: Record<string, unknown> = {}) {
  if (window.scriptManagerDesktop?.runtime?.updatePlugin) {
    return window.scriptManagerDesktop.runtime.updatePlugin({ id, action, ...payload })
  }
  throw new Error('Desktop runtime unavailable')
}

export async function removePluginRuntime(id: string) {
  if (window.scriptManagerDesktop?.runtime?.removePlugin) {
    return window.scriptManagerDesktop.runtime.removePlugin(id)
  }
  throw new Error('Desktop runtime unavailable')
}
