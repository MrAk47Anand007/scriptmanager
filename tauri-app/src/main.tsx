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
  selectFolder: async () => { const { open } = await import('@tauri-apps/plugin-dialog'); const picked = await open({ directory: true, multiple: false }); return typeof picked === 'string' ? picked : null; },
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
    syncGist: (scriptId: string) => invokeTauri('sync_gist', { scriptId }),
    deleteGist: (scriptId: string) => invokeTauri('delete_gist', { scriptId }),
    readSchedule: (scriptId: string) => invokeTauri('read_schedule', { scriptId }),
    saveSchedule: (payload: { scriptId: string; cron: string; enabled: boolean }) => invokeTauri('save_schedule', { payload }),
    deleteSchedule: (scriptId: string) => invokeTauri('delete_schedule', { scriptId }),
    getObservabilityDashboard: (filters?: { kind?: string; status?: string }) =>
      invokeTauri('get_observability_dashboard', { filters: filters ?? null }),
    getObservabilityRunDetail: (payload: { kind: string; id: string }) =>
      invokeTauri('get_observability_run_detail', { kind: payload.kind, id: payload.id }),
    cancelObservabilityRun: (id: string) => invokeTauri('cancel_observability_run', { kind: 'workflow', id }),
    retryObservabilityRun: (payload: { id: string; nodeId?: string }) =>
      invokeTauri('retry_observability_run', { kind: 'workflow', id: payload.id, nodeId: payload.nodeId ?? null }),
    readObservabilityLog: (payload: { kind: string; id: string }) =>
      invokeTauri('read_observability_log', { kind: payload.kind, id: payload.id }),
    listApprovals: (status?: string) => invokeTauri('list_approvals', { status: status ?? null }),
    decideApproval: (payload: { id: string; decision: string; note?: string }) => invokeTauri('decide_approval', { payload }),
    listNotificationChannels: () => invokeTauri('list_notification_channels'),
    createNotificationChannel: (payload: { name: string; kind: string; config?: unknown }) => invokeTauri('create_notification_channel', { payload }),
    listNotificationRules: () => invokeTauri('list_notification_rules'),
    createNotificationRule: (payload: unknown) => invokeTauri('create_notification_rule', { payload: payload as Record<string, unknown> }),
    listNotificationDeliveries: (since?: string) => invokeTauri('list_notification_deliveries', { since: since ?? null }),
    listServerProfiles: () => invokeTauri('list_server_profiles'),
    saveServerProfile: (payload: unknown) => invokeTauri('save_server_profile', { payload: payload as Record<string, unknown> }),
    deleteServerProfile: (id: string) => invokeTauri('delete_server_profile', { id }),
    testServerProfileConnection: (profileId: string) => invokeTauri('test_server_profile_connection', { profileId }),
    transferRemoteScript: (payload: unknown) => invokeTauri('transfer_remote_script', { payload: payload as Record<string, unknown> }),
    startRemoteExecution: (payload: unknown) => invokeTauri('start_remote_execution', { payload: payload as Record<string, unknown> }),
    approveRemoteExecution: (payload: { id: string; note?: string }) => invokeTauri('approve_remote_execution', { payload }),
    rejectRemoteExecution: (payload: { id: string }) => invokeTauri('reject_remote_execution', { payload }),
    listAuditLog: (params?: unknown) => invokeTauri('list_audit_log', { params: params ?? null }),
    onRemoteExecEvent: (listener: DesktopListener<ScriptManagerDesktopRemoteExecEvent>) =>
      subscribe('remote-exec-event', listener),
    listStorageProviders: () => invokeTauri('list_storage_providers'),
    saveStorageProvider: (payload: unknown) => invokeTauri('save_storage_provider', { payload: payload as Record<string, unknown> }),
    deleteStorageProvider: (id: string) => invokeTauri('delete_storage_provider', { id }),
    testStorageProvider: (id: string) => invokeTauri('test_storage_provider', { id }),
    syncCollection: (collectionId: string) => invokeTauri('sync_collection', { collectionId }),
    listAgentProfiles: () => invokeTauri('list_agent_profiles'),
    createAgentProfile: (payload: unknown) => invokeTauri('create_agent_profile', { payload: payload as Record<string, unknown> }),
    listAgentRuns: () => invokeTauri('list_agent_runs'),
    readAgentRun: (id: string) => invokeTauri('read_agent_run', { id }),
    agents: {
      discover: () => invokeTauri('discover_agent_providers'),
      run: (payload: unknown) => invokeTauri('run_agent', { payload: payload as Record<string, unknown> }),
      interruptRun: (id: string) => invokeTauri('interrupt_agent_run', { id }),
      resumeRun: (payload: unknown) => invokeTauri('resume_agent_run', { payload: payload as Record<string, unknown> }),
    },
    listPlugins: () => invokeTauri('list_plugins'),
    updatePlugin: (payload: { id: string; action: string; settings?: unknown }) =>
      invokeTauri('update_plugin', { payload: payload as Record<string, unknown> }),
    removePlugin: (id: string) => invokeTauri('remove_plugin', { id }),
    listWorkspaceAccess: () => invokeTauri('list_workspace_access'),
    createWorkspaceInvitation: (payload: unknown) => invokeTauri('create_workspace_invitation', { payload: payload as Record<string, unknown> }),
    revokeWorkspaceGrants: (payload?: { actorId?: string }) => invokeTauri('revoke_workspace_grants', { payload: payload ?? {} }),
    createWorkspaceRole: (payload: unknown) => invokeTauri('create_workspace_role', { payload: payload as Record<string, unknown> }),
    scanPcScripts: (payload: { roots: string[]; extensions: string[] }) => invokeTauri('scan_pc_scripts', { payload }),
    importScannedScripts: (payload: { files: { path: string }[]; mode: 'misc' | 'by-folder'; rootForGrouping?: string }) =>
      invokeTauri('import_scanned_scripts', { payload }),
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
