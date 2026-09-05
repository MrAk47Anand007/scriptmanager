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
    listApiCollections: () => invokeTauri('list_api_collections'),
    saveApiCollection: (payload: unknown) => invokeTauri('save_api_collection', { payload: payload as Record<string, unknown> }),
    deleteApiCollection: (id: string) => invokeTauri('delete_api_collection', { id }),
    listApiRequests: (collectionId?: string | null) => invokeTauri('list_api_requests', { collectionId: collectionId ?? null }),
    saveApiRequest: (payload: unknown) => invokeTauri('save_api_request', { payload: payload as Record<string, unknown> }),
    deleteApiRequest: (id: string) => invokeTauri('delete_api_request', { id }),
    listApiEnvironments: () => invokeTauri('list_api_environments'),
    saveApiEnvironment: (payload: unknown) => invokeTauri('save_api_environment', { payload: payload as Record<string, unknown> }),
    deleteApiEnvironment: (id: string) => invokeTauri('delete_api_environment', { id }),
    readApiGlobals: () => invokeTauri('read_api_globals'),
    saveApiGlobals: (variables: string) => invokeTauri('save_api_globals', { variables }),
    sendApiRequest: (payload: unknown) => invokeTauri('send_api_request', { payload: payload as Record<string, unknown> }),
    listApiHistory: () => invokeTauri('list_api_history'),
    clearApiHistory: () => invokeTauri('clear_api_history'),
    runApiCollection: (payload: { collectionId: string; environmentId: string | null }) => invokeTauri('run_api_collection', { payload }),
    listApiCollectionRuns: () => invokeTauri('list_api_collection_runs'),
    readSettings: () => invokeTauri('read_settings'),
    saveSettings: (payload: Record<string, string>) => invokeTauri('save_settings', { payload }),
    readGithubGistSettings: () => invokeTauri('read_github_gist_settings'),
    saveGithubGistSettings: (payload: { token?: string; syncEnabled: boolean }) => invokeTauri('save_github_gist_settings', { payload }),
    clearGithubGistSettings: () => invokeTauri('clear_github_gist_settings'),
    exportScripts: () => invokeTauri('export_scripts'),
    exportScript: (scriptId: string) => invokeTauri('export_script', { scriptId }),
    importScripts: (payload: unknown) => invokeTauri('import_scripts', { payload: payload as Record<string, unknown> }),
    listSecrets: () => invokeTauri('list_secrets'),
    createSecret: (payload: unknown) => invokeTauri('create_secret', { payload: payload as Record<string, unknown> }),
    rotateSecret: (payload: unknown) => invokeTauri('rotate_secret', { payload: payload as Record<string, unknown> }),
    disableSecret: (payload: unknown) => invokeTauri('disable_secret', { payload: payload as Record<string, unknown> }),
    revealSecret: (payload: unknown) => invokeTauri('reveal_secret', { payload: payload as Record<string, unknown> }),
    listProjects: () => invokeTauri('list_projects'),
    saveProject: (payload: unknown) => invokeTauri('save_project', { payload: payload as Record<string, unknown> }),
    deleteProject: (id: string) => invokeTauri('delete_project', { id }),
    assignCollectionToProject: (payload: { collectionId: string; projectId: string | null }) => invokeTauri('assign_collection_to_project', { payload }),
    runGitAction: (payload: { projectId: string; action: unknown }) => invokeTauri('run_git_action', { payload: payload as Record<string, unknown> }),
    gitProbe: (payload: { url: string; token?: string | null }) => invokeTauri('git_probe', { url: payload.url, token: payload.token ?? null }),
    gitCloneProject: (payload: { url: string; targetPath: string; token?: string; projectName?: string; branch?: string }) => invokeTauri('git_clone_project', { payload }),
    listWorkflows: () => invokeTauri('list_workflows'),
    createWorkflow: (payload: unknown) => invokeTauri('create_workflow', { payload: payload as Record<string, unknown> }),
    saveWorkflow: (payload: unknown) => invokeTauri('save_workflow', { payload: payload as Record<string, unknown> }),
    publishWorkflow: (id: string) => invokeTauri('publish_workflow', { id }),
    runWorkflow: (payload: { id: string; input?: unknown }) => invokeTauri('run_workflow', { payload: payload as Record<string, unknown> }),
    listWorkflowRuns: (workflowId: string) => invokeTauri('list_workflow_runs', { workflowId }),
    readWorkflowRun: (runId: string) => invokeTauri('read_workflow_run', { runId }),
    retryWorkflowNode: (payload: { runId: string; nodeId: string }) => invokeTauri('retry_workflow_node', { payload }),
    cancelWorkflowRun: (runId: string) => invokeTauri('cancel_workflow_run', { runId }),
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
    closeTerminal: (payload?: { sessionId?: string }) =>
      invokeTauri('close_terminal', { sessionId: payload?.sessionId ?? 'default' }),
    setTerminalContext: (payload: { sessionId?: string; scriptId: string | null }) =>
      invokeTauri('set_terminal_context', { sessionId: payload.sessionId ?? 'default', scriptId: payload.scriptId }),
    runScriptInTerminal: (payload: { sessionId?: string; scriptId: string; paramValues?: Record<string, string> }) =>
      invokeTauri('run_script_in_terminal', { sessionId: payload.sessionId ?? 'default', scriptId: payload.scriptId, paramValues: payload.paramValues }),
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
