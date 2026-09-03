import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listen } from '@tauri-apps/api/event'
import { desktopCapabilities } from '@/lib/desktopCapabilities'
import { invokeTauri } from '@/lib/tauriInvoke'

type DesktopListener<T> = (event: T) => void

function subscribe<T>(eventName: string, listener: DesktopListener<T>) {
  let active = true
  let unlisten: (() => void) | undefined

  void listen<T>(eventName, (event) => {
    if (active) listener(event.payload)
  }).then((unsubscribe) => {
    if (active) {
      unlisten = unsubscribe
    } else {
      unsubscribe()
    }
  })

  return () => {
    active = false
    unlisten?.()
  }
}

window.__TAURI__ = true
window.__ELECTRON__ = true
window.scriptManagerDesktop = {
  capabilities: desktopCapabilities,
  runtime: {
    getBootstrapState: () => invokeTauri('get_bootstrap_state'),
    listScripts: () => invokeTauri('get_scripts'),
    createScript: (payload: unknown) => invokeTauri('create_script', { payload }),
    readScript: (scriptId: string) => invokeTauri('read_script', { scriptId }),
    saveScript: (payload: unknown) => invokeTauri('save_script', { payload }),
    deleteScript: (payload: { id: string }) => invokeTauri('delete_script', { payload }),
    duplicateScript: (scriptId: string) => invokeTauri('duplicate_script', { scriptId }),
    listCollections: () => invokeTauri('get_collections'),
    createCollection: (payload: unknown) => invokeTauri('create_collection', { payload }),
    updateCollection: (payload: unknown) => invokeTauri('update_collection', { payload }),
    deleteCollection: (payload: { id: string; hardDelete?: boolean }) => invokeTauri('delete_collection', { payload }),
    moveScript: (payload: { scriptId: string; collectionId: string | null }) =>
      invokeTauri('move_script', { payload }),
    listTags: () => invokeTauri('list_tags'),
    addTag: (payload: { scriptId: string; name: string; color?: string }) => invokeTauri('add_tag', { payload }),
    removeTag: (payload: { scriptId: string; tagId: string }) => invokeTauri('remove_tag', { payload }),
    listTemplates: () => invokeTauri('list_templates'),
    saveTemplate: (payload: unknown) => invokeTauri('save_template', { payload }),
    deleteTemplate: (id: string) => invokeTauri('delete_template', { id }),
    listEnv: (scriptId: string) => invokeTauri('list_env', { scriptId }),
    saveEnv: (payload: unknown) => invokeTauri('save_env', { payload }),
    deleteEnv: (payload: { scriptId: string; key: string }) => invokeTauri('delete_env', { payload }),
    listVersions: (scriptId: string) => invokeTauri('list_versions', { scriptId }),
    readVersion: (payload: { scriptId: string; versionId: string }) => invokeTauri('read_version', { payload }),
    listBuilds: (scriptId: string) => invokeTauri('list_builds', { scriptId }),
    readBuildOutput: (payload: { scriptId: string; buildId: string }) => invokeTauri('read_build_output', { payload }),
    runScript: (payload: unknown) => invokeTauri('run_script', { payload }),
    cancelRun: (buildId: string) => invokeTauri('cancel_run', { buildId }),
    readSettings: () => invokeTauri('get_settings'),
    warmTerminal: (payload?: { sessionId?: string }) =>
      invokeTauri('create_terminal', { sessionId: payload?.sessionId ?? 'default' }),
    sendTerminalInput: (payload: { sessionId?: string; data: string }) =>
      invokeTauri('write_terminal', { sessionId: payload.sessionId ?? 'default', data: payload.data }),
    resizeTerminal: (payload: { sessionId?: string; cols: number; rows: number }) =>
      invokeTauri('resize_terminal', {
        sessionId: payload.sessionId ?? 'default',
        cols: payload.cols,
        rows: payload.rows,
      }),
    onTerminalEvent: (listener: DesktopListener<ScriptManagerDesktopTerminalEvent>) =>
      subscribe('terminal-event', listener),
    onBuildEvent: (listener: DesktopListener<ScriptManagerDesktopBuildEvent>) =>
      subscribe('build-event', listener),
    onCanonicalFolderChange: (listener) => subscribe('canonical-folder-change', listener),
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
