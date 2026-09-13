import { invokeTauri } from '@/lib/tauriInvoke'

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

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

export async function getPluginSourceRuntime(pluginId: string): Promise<string> {
  if (isTauri()) return invokeTauri('get_plugin_source', { pluginId })
  if (window.scriptManagerDesktop?.runtime?.getPluginSource) {
    return window.scriptManagerDesktop.runtime.getPluginSource(pluginId)
  }
  return ''
}

export async function savePluginSourceRuntime(pluginId: string, entryPoint: string): Promise<void> {
  if (isTauri()) {
    await invokeTauri('save_plugin_source', { pluginId, entryPoint })
    return
  }
  if (window.scriptManagerDesktop?.runtime?.savePluginSource) {
    await window.scriptManagerDesktop.runtime.savePluginSource({ pluginId, entryPoint })
    return
  }
  throw new Error('Desktop runtime unavailable')
}

export async function runPluginRuntime(payload: { pluginId: string; input?: unknown }): Promise<{ result: unknown; logs: unknown[] }> {
  if (isTauri()) return invokeTauri('run_plugin', { payload }) as Promise<{ result: unknown; logs: unknown[] }>
  if (window.scriptManagerDesktop?.runtime?.runPlugin) {
    return window.scriptManagerDesktop.runtime.runPlugin(payload)
  }
  throw new Error('Desktop runtime unavailable')
}
