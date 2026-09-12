# ScriptManager Tauri Remaining Migration Checklist - 2026-09-12

## Purpose

This is the current agent pickup document for finishing the Electron-to-Tauri migration on branch `feat/tauri-rewrite`.

The active product path is `tauri-app/`. The old Electron/Next implementation remains useful as a behavior reference, but the Tauri app must not depend on Electron IPC, the embedded Next server, or `/api/*` fallbacks for desktop execution.

## Current Repo State

- `jbcontext` index exists for revision `497cafb374bb`.
- `tauri-app/src/main.tsx` exposes an explicit `window.scriptManagerDesktop` bridge backed by Tauri `invoke`.
- `tauri-app/src-tauri/src/lib.rs` registers native commands for most major surfaces.
- `tauri-app/scripts/check-no-desktop-api-fallback.mjs` guards runtime clients against unguarded desktop `/api/*` fallback.
- `docs/releases/tauri-smoke-2026-09-05.md` records a green smoke baseline with known migration-pending items.
- The old broad migration plan remains at `docs/superpowers/plans/2026-09-02-tauri-full-migration-master-plan.md`.

Do not treat this document as proof that everything is complete. Treat it as the execution checklist for what still needs migration hardening, live proof, and cleanup.

## Non-Negotiable Rules

- Keep `window.scriptManagerDesktop.runtime` explicit. Do not add a catch-all proxy.
- Do not introduce desktop-mode `/api/*` fallback.
- Do not silently return `null`, `[]`, or fake success when a Tauri command fails.
- If a feature is intentionally not migrated yet, show a visible stable pending state and persist a typed error where relevant.
- Every migrated feature needs all three layers: Rust command/service, typed renderer runtime client, and verification evidence.
- Use explicit SQL column lists in Rust.
- Preserve old Electron behavior only as a reference; do not rebuild Electron dependencies inside Tauri.
- Keep OS, network, provider, and credential dependent checks separate from source/test completion.

## Authoritative Code Maps

### Old Electron / Web Reference

- `electron/desktopRuntime.ts`: script, collection, env, version, build, file, clipboard, terminal, and local desktop runtime behavior.
- `electron/apiRuntime.ts`: API client persistence and send/run behavior.
- `electron/opsRuntime.ts`: server profiles, remote execution, approvals, and audit behavior.
- `electron/oauthFlow.ts` and `electron/oauthDefaults.ts`: Google Drive and OneDrive desktop OAuth behavior.
- `electron/preload.ts`: old bridge contract and top-level desktop helpers.
- `src/app/api/**`: old web route behavior. Use for reference only.
- `src/lib/**`: old domain services for workflows, approvals, notifications, plugins, storage, security, RBAC, agents, and Git.
- `prisma/schema.prisma`: schema reference until Rust schema is fully audited.

### Active Tauri Runtime

- `tauri-app/src/main.tsx`: renderer bridge and Tauri command mapping.
- `tauri-app/src/types/electron.d.ts`: current window contract, including leftover Electron names.
- `tauri-app/src/lib/*RuntimeClient.ts`: renderer domain clients.
- `tauri-app/src/lib/runtime/desktopMode.ts`: Tauri desktop detection.
- `tauri-app/src/lib/desktopCapabilities.ts`: visible feature capability map.
- `tauri-app/src-tauri/src/lib.rs`: command registration.
- `tauri-app/src-tauri/src/schema.rs`: SQLite bootstrap.
- `tauri-app/src-tauri/src/commands.rs`: scripts, collections, tags, templates, env/version/build/open-folder commands.
- `tauri-app/src-tauri/src/execution.rs`: script/API/JS execution and build events.
- `tauri-app/src-tauri/src/terminal.rs`: PTY lifecycle and terminal events.
- `tauri-app/src-tauri/src/api_client.rs`: API client persistence and request execution.
- `tauri-app/src-tauri/src/workflows.rs`: workflow CRUD/run/cancel/retry.
- `tauri-app/src-tauri/src/observability.rs`: execution dashboard and logs.
- `tauri-app/src-tauri/src/git_ops.rs`, `projects.rs`: projects and source control.
- `tauri-app/src-tauri/src/security.rs`: secret vault.
- `tauri-app/src-tauri/src/settings.rs`, `gist.rs`, `scheduler.rs`: settings, Gist, schedules.
- `tauri-app/src-tauri/src/approvals.rs`, `notifications.rs`: approvals and notification records.
- `tauri-app/src-tauri/src/remote_exec.rs`: server profiles and remote execution shell.
- `tauri-app/src-tauri/src/storage.rs`: storage provider records and sync.
- `tauri-app/src-tauri/src/agents.rs`: agent profile/history plus pending provider execution.
- `tauri-app/src-tauri/src/plugins.rs`: plugin registry plus pending execution host.
- `tauri-app/src-tauri/src/workspace_access.rs`: local owner workspace access model.

## Agent Pickup Order

Work in this order. Each slice should end with source verification, visible/manual proof when applicable, and an update to this checklist or a release smoke document.

1. Contract cleanup and bridge parity.
2. OS helpers and desktop shell conveniences.
3. Cloud storage OAuth and remote sync transports.
4. Notifications native delivery and deep links.
5. Remote execution real SSH/SCP transport.
6. ACP agent process execution and event streaming.
7. Plugin execution host boundary.
8. Workflow node parity for remote, notification, agent, and plugin nodes.
9. Git approval-required operations.
10. Final Electron/web residue cleanup and release verification.

## Full Checklist

### 1. Contract Cleanup And Bridge Parity

Status: required cleanup.

- [x] Remove the misleading `window.__ELECTRON__ = true` assignment from the Tauri bootstrap, or quarantine it behind a compatibility helper with a clear name.
- [x] Update `tauri-app/src/lib/runtime/index.ts`; its `isDesktop()` still checks `window.__ELECTRON__`.
- [x] Audit all `window.__ELECTRON__` checks in `tauri-app/src/**` and migrate them to `isDesktopRenderer()` or `window.__TAURI__`.
- [x] Align `tauri-app/src/types/electron.d.ts` with actual Tauri bridge methods.
- [x] Make absent top-level helpers optional in types if they are intentionally not implemented.
- [x] Add or extend a guard so required typed bridge methods cannot drift from `tauri-app/src/main.tsx`.
- [x] Re-run `npm run guard:no-api-fallback` after the cleanup.

Progress 2026-09-12: removed the false Electron flag from `tauri-app/src/main.tsx`, switched Tauri desktop detection to `isDesktopRenderer()`, removed `__ELECTRON__` and `data-electron` references from `tauri-app/src/**`, made missing bridge helpers optional in `electron.d.ts`, added `npm run guard:desktop-bridge`, and verified `npx tsc --noEmit`, `npm run guard:no-api-fallback`, `npm run guard:desktop-bridge`, and `npm run build`.

Evidence to inspect:

- `tauri-app/src/main.tsx`
- `tauri-app/src/types/electron.d.ts`
- `tauri-app/src/lib/runtime/index.ts`
- `tauri-app/src/lib/runtime/desktopMode.ts`

Done means:

- No renderer code treats Tauri as Electron except through an explicit compatibility helper.
- Type declarations do not advertise unavailable required methods.
- Desktop detection is Tauri-native.

### 2. OS Helpers And Desktop Shell Conveniences

Status: partially missing.

Leftover Electron-style helpers are referenced or typed but not implemented in the Tauri bridge:

- `revealPath`
- `copyText`
- `readClipboardText`
- `setNotificationsEnabled`
- `showNotification`
- `onNotificationDeepLink`
- `oauthConnect`
- `oauthDefaults`
- `agents.onEvent`
- `agents.terminateRun`

Checklist:

- [x] Add Tauri plugins or Rust commands for clipboard read/write.
- [x] Add path reveal/open-in-file-manager command.
- [x] Add notification enablement persistence, if still required by the Desktop settings UI.
- [x] Add native notification display and click/deep-link routing, or remove those controls from Tauri UI.
- [x] Update `DesktopNotificationHost` so it checks Tauri support, not Electron identity.
- [x] Update `PythonEnvDialog` reveal-path UX to show a pending or disabled state until `revealPath` exists.
- [x] Add tests or smoke notes for clipboard and reveal path.

Progress 2026-09-12: exposed `copyText`, `readClipboardText`, `setNotificationsEnabled`, `showNotification`, and `onNotificationDeepLink` in `tauri-app/src/main.tsx`; added Rust `reveal_path` and registered it in `tauri-app/src-tauri/src/lib.rs`; switched `DesktopNotificationHost` to Tauri desktop detection; enabled `desktopCapabilities.notifications`; verified `npx tsc --noEmit`, `npm run guard:desktop-bridge`, and a focused Rust compile via `cargo test reveal_path -- --nocapture` (0 matching tests, compile succeeded; existing warnings only).

Evidence to inspect:

- `tauri-app/src/components/notifications/DesktopNotificationHost.tsx`
- `tauri-app/src/components/settings/DesktopSection.tsx`
- `tauri-app/src/components/workbench/WorkbenchShell.tsx`
- `tauri-app/src/components/sidebar/PythonEnvDialog.tsx`
- `tauri-app/src/lib/scriptsRuntimeClient.ts`

Done means:

- No UI calls a missing top-level desktop helper.
- Native clipboard/path/notification actions either work or render a clear unavailable state.

### 3. Scripts, Collections, Tags, Templates, Env, Versions, Builds

Status: mostly migrated; verify and close gaps.

Already present in Tauri:

- Script CRUD, duplicate, delete.
- Collection CRUD, hard delete, move script.
- Open local folder and inspect folder.
- Tags and templates.
- Env vars, versions, builds, run/cancel, build events.
- Terminal-backed script run.
- Scan PC/import scanned scripts.
- Schedules and Gist logic.

Checklist:

- [ ] Verify current `open_folder` fix in a visible Tauri app after restart.
- [x] Verify Python venv workspace management paths. `inspectCollectionWorkspace` and `manageCollectionPythonEnv` now exist in the Tauri bridge and native command handler.
- [x] Decide whether Python venv management must be ported to Rust or disabled. It is ported to Rust for linked local workspaces.
- [x] Check canonical-folder recovery methods still listed in types but absent from the bridge: `rescanCanonicalFolder`, `listCanonicalRecoveryDrafts`, `saveCanonicalRecoveryDraft`, `discardCanonicalRecoveryDraft`.
- [x] If canonical source recovery is still a product requirement, port from Electron/reference TS into Rust.
- [ ] Re-test Gist sync with a real GitHub token. Current source proof is logic-only.
- [x] Confirm `regenerateWebhook`, `regenerateWebhookSecret`, and `toggleWebhookSignature` are intentionally disabled in Tauri desktop or migrate them. They are migrated through Tauri native commands.

Evidence to inspect:

- `tauri-app/src-tauri/src/commands.rs`
- `tauri-app/src-tauri/src/execution.rs`
- `tauri-app/src-tauri/src/gist.rs`
- `tauri-app/src-tauri/src/scheduler.rs`
- `tauri-app/src/lib/scriptsRuntimeClient.ts`
- `tauri-app/src/features/scripts/scriptsSlice.ts`
- `electron/desktopRuntime.ts`

Progress notes:

- 2026-09-12: Added Tauri-native collection workspace inspection and Python `.venv` management, bridged it through `window.scriptManagerDesktop.runtime`, and covered linked-folder status plus metadata update paths with focused Rust tests.
- 2026-09-12: Added Tauri-native webhook token rotation, webhook secret rotation, and signature toggle commands, then covered the persisted security fields with a focused Rust test.
- 2026-09-12: Added Tauri-native canonical folder rescan plus recovery draft save/list/discard storage and covered both with focused Rust tests.

Done means:

- Scripts workspace can create/edit/delete/move/tag/template/run/cancel scripts, manage env/version/build history, and handle linked folders without Electron.
- Any hosted-web-only features are clearly disabled in desktop.

### 4. Terminal Lifecycle

Status: migrated; keep regression proof.

Checklist:

- [ ] Re-run live PTY smoke in Tauri: create terminal, send command, resize, close, restart.
- [x] Confirm child processes are terminated on close and app exit. Source cleanup/bookkeeping is covered; live app-exit smoke remains in release verification.
- [x] Confirm terminal events use only `terminal-event` with typed payloads.
- [x] Confirm no WebSocket terminal path is reachable in Tauri desktop.

Evidence to inspect:

- `tauri-app/src-tauri/src/terminal.rs`
- `tauri-app/src/components/TerminalComponent.tsx`
- `tauri-app/src/lib/scriptsRuntimeClient.ts`
- Old reference: `src/lib/socketService.ts`

Done means:

- Terminal works without node-pty, WebSocket, or Electron IPC.

### 5. API Client

Status: migrated for core workspace; verify edge behavior.

Checklist:

- [x] Verify collection/request/environment/globals CRUD through Tauri.
- [ ] Verify send request with bearer/basic/API key/no-auth.
- [x] Verify OAuth2 request auth behavior. Token entry can be manual, but provider OAuth flows are separate storage/OAuth work.
- [x] Verify pre-request and test script behavior. Native request execution now returns persisted migration-pending console/test results instead of silently dropping scripts.
- [x] Verify collection run summaries and persisted history.
- [x] Confirm `apiRuntimeClient.ts` never reaches `/api/*` in Tauri mode.

Evidence to inspect:

- `tauri-app/src-tauri/src/api_client.rs`
- `tauri-app/src/lib/apiRuntimeClient.ts`
- `tauri-app/src/features/api/apiSlice.ts`
- Old reference: `src/lib/executeApiRequest.ts`

Progress notes:

- 2026-09-12: Added native API auth preparation for API key header/query and manual OAuth2 access-token auth, with variable substitution covered by Rust tests.
- 2026-09-12: Pre-request and post-request scripts remain migration-pending, but native send/history now return explicit persisted console/test evidence when configured.

Done means:

- API workspace operates from Rust/SQLite/reqwest with persisted history and controlled unsupported states.

### 6. Workflows

Status: core migrated; node parity incomplete.

Already present:

- Workflow CRUD, publish, run, list runs, read run, retry node, cancel run.
- Script/API/condition/transform/delay-style execution paths appear migrated.
- Unsupported node types persist a failed node error.

Still pending:

- Remote workflow nodes.
- Notification workflow nodes.
- Agent workflow nodes.
- Plugin workflow nodes.

Checklist:

- [x] Decide whether each pending node type must be implemented now or visibly marked migration-pending.
- [ ] Port notification node execution after native notification/dispatcher parity is complete.
- [ ] Port remote node execution after SSH transport is complete.
- [ ] Port agent node execution after ACP provider process execution is complete.
- [ ] Port plugin node execution after plugin host boundary is complete.
- [x] Keep unsupported-node tests proving persisted failure state.

Evidence to inspect:

- `tauri-app/src-tauri/src/workflows.rs`
- `tauri-app/src/lib/workflowsRuntimeClient.ts`
- `tauri-app/src/lib/workflows/nodeExecutors.ts`
- Old reference: `src/lib/workflows/**`

Done means:

- Workflow runs either execute every visible node type or fail unsupported nodes with a clear persisted migration-pending error.

### 7. Observability

Status: migrated for persisted local execution records; verify cross-feature links.

Checklist:

- [x] Verify dashboard filters for script, workflow, API, remote, agent, and plugin kinds.
- [x] Verify read log for script builds and workflow runs.
- [x] Verify cancel/retry dispatch only targets supported run kinds.
- [x] Confirm unsupported kinds return typed errors, not empty objects.
- [x] Verify retention/cleanup behavior if still in release scope.

Evidence to inspect:

- `tauri-app/src-tauri/src/observability.rs`
- `tauri-app/src/lib/observabilityRuntimeClient.ts`
- Old reference: `src/lib/observability/**`

Done means:

- Executions screen is truthful about migrated and pending run kinds.

### 8. Settings, Security, Secrets, Gist

Status: mostly migrated; needs live credential proof.

Checklist:

- [x] Verify settings read/save against Tauri SQLite.
- [x] Verify secret create/rotate/disable/reveal with redaction and audit events.
- [x] Confirm plaintext secrets never appear in renderer logs or persisted execution payloads.
- [x] Verify GitHub Gist settings save/clear and token masking.
- [x] Run live Gist sync/delete with a real token, or keep it explicitly pending in release evidence.
- [x] Confirm old `DESKTOP_AUTH_SECRET` assumptions are removed or replaced for Tauri storage/security.

Evidence to inspect:

- `tauri-app/src-tauri/src/security.rs`
- `tauri-app/src-tauri/src/settings.rs`
- `tauri-app/src-tauri/src/gist.rs`
- `tauri-app/src/lib/secretsRuntimeClient.ts`
- `tauri-app/src/lib/gistCredentialsRuntimeClient.ts`
- Old references: `src/lib/secrets/**`, `src/lib/storage/secretBox.ts`

Done means:

- Sensitive flows are native, auditable, and do not rely on Electron/Next request context.

### 9. Approvals

Status: local approval records migrated; integration gaps remain.

Checklist:

- [x] Verify approval inbox load/filter/decide in Tauri.
- [x] Wire approval-required Git operations or explicitly block them with a visible approval-pending message.
- [x] Wire approvals into remote execution, agent permissions, and plugin host if those surfaces are migrated.
- [x] Confirm decisions are immutable after allow/reject.

Evidence to inspect:

- `tauri-app/src-tauri/src/approvals.rs`
- `tauri-app/src/components/approvals/ApprovalInbox.tsx`
- `tauri-app/src-tauri/src/git_ops.rs`
- Old reference: `src/lib/approvals/**`

Done means:

- Protected operations can request and consume approvals natively, or are visibly unavailable.

Progress notes:

- 2026-09-12: Git protected actions are integrated with native approval requests. Remote execution, agent permissions, and plugin host approvals remain not applicable to this milestone because those runtime surfaces are still migration-pending and visibly unavailable.

### 10. Notifications

Status: records/rules migrated; OS-native delivery pending.

Checklist:

- [x] Implement OS-native notification delivery in Tauri, or remove desktop notification delivery claims.
- [x] Implement notification deep-link click handling back into the app.
- [x] Preserve rule matching, throttling, retry, and failure accounting.
- [x] Decide which channel kinds are supported locally: desktop, webhook, Slack, SMTP, Teams.
- [x] For network delivery channels, port secret resolution and outbound client logic or mark pending.
- [x] Update `desktopCapabilities.notifications` when the feature is truly available.

Evidence to inspect:

- `tauri-app/src-tauri/src/notifications.rs`
- `tauri-app/src/components/notifications/DesktopNotificationHost.tsx`
- `tauri-app/src/components/settings/NotificationsSection.tsx`
- Old reference: `src/lib/notifications/**`

Done means:

- Notifications either deliver natively or are explicitly recorded as configuration/history only.

### 11. Ops And Remote Execution

Status: profile/audit shell migrated; real SSH/SCP transport pending.

Current code records profiles and remote execution state, but dedicated SSH/SCP transport remains migration-pending.

Checklist:

- [x] Choose and document Rust SSH/SCP crate and security model.
- [ ] Port connection test from `ssh2` behavior to Rust.
- [ ] Port file transfer/SCP.
- [ ] Port command execution streaming with `remote-exec-event`.
- [ ] Preserve approval gate behavior for protected remote execution.
- [x] Verify audit log shape remains `{ total, executions }` for renderer compatibility.
- [ ] Add integration tests with a mock or disposable SSH server if feasible.

Evidence to inspect:

- `tauri-app/src-tauri/src/remote_exec.rs`
- `tauri-app/src/lib/opsRuntimeClient.ts`
- `tauri-app/src/features/ops/opsSlice.ts`
- `docs/tauri-remote-exec-ssh.md`
- Old references: `electron/opsRuntime.ts`, `src/lib/ops/**`

Progress notes:

- 2026-09-12: Chose `russh` plus `russh-sftp` for the future Tauri SSH/SFTP transport and documented host-key, secret, containment, event, and approval requirements.

Done means:

- Ops can test, transfer, execute, approve/reject, stream output, and audit without Electron or web SSE.

### 12. Git Projects And Source Control

Status: mostly migrated; approval and destructive operations need review.

Checklist:

- [x] Verify project CRUD and collection-project assignment.
- [x] Verify clone/probe/status/log/diff/stage/unstage/commit/fetch/pull/push flows through `run_git_action`.
- [x] Review operations blocked by "requires approval, which is not migrated yet".
- [x] Add native approval request/decision integration for protected Git actions.
- [x] Confirm all Git execution uses argument arrays or safe libraries, never shell-built commands.
- [x] Verify repository-root containment for every path and file action.

Evidence to inspect:

- `tauri-app/src-tauri/src/git_ops.rs`
- `tauri-app/src-tauri/src/projects.rs`
- `tauri-app/src/lib/gitRuntimeClient.ts`
- `tauri-app/src/components/git/SourceControlWorkbench.tsx`
- Old reference: `src/lib/git/**`

Progress notes:

- 2026-09-12: Protected Git actions still return the native approval-required block, and the Source Control workbench now renders a persistent approval-pending banner instead of only a generic failure toast.
- 2026-09-12: Protected Git actions now create/reuse native approval requests, block while pending, honor rejected decisions, and proceed past the approval gate after an approved matching request. The workbench banner now directs users to the Approvals inbox before retrying.
- 2026-09-12: Added native dispatcher coverage for status, log, branches, diff, add/stage, reset/unstage, commit, push, fetch, and pull against a temporary local repository and bare origin. Clone/probe coverage remains covered by dedicated helpers and command paths; visual workbench smoke is tracked in the manual smoke section.

Done means:

- Source Control workbench supports normal Git flows and safely blocks or approves protected actions.

### 13. Cloud Storage Providers And OAuth

Status: provider CRUD/local sync partly migrated; GDrive/OneDrive OAuth and some transports pending.

Checklist:

- [x] Implement or explicitly disable `oauthConnect` and `oauthDefaults` in Tauri. OAuth providers are blocked in native save until OAuth is ported.
- [x] Replace UI copy that points users to `electron/oauthDefaults.ts`.
- [x] Decide supported providers for this milestone: local, S3, GCS, WebDAV, Google Drive, OneDrive. Local is supported; S3/GCS/WebDAV are config-only with typed pending test/sync errors; GDrive/OneDrive are blocked because OAuth is not migrated.
- [x] Port token storage and refresh for supported OAuth providers. No OAuth provider is supported in this milestone.
- [x] Port provider test implementations for every enabled provider kind. Local provider test is implemented; pending transports return typed pending status.
- [x] Port collection sync transport for every enabled provider kind. Local collection push-sync is implemented; pending transports return typed pending status.
- [x] Keep pending provider kinds impossible to save, or visibly marked migration-pending.

Evidence to inspect:

- `tauri-app/src-tauri/src/storage.rs`
- `tauri-app/src/lib/storageRuntimeClient.ts`
- `tauri-app/src/components/settings/CloudStorageSection.tsx`
- `tauri-app/src/components/sidebar/CloudStorageDialog.tsx`
- Old references: `electron/oauthFlow.ts`, `electron/oauthDefaults.ts`, `src/lib/storage/**`

Progress notes:

- 2026-09-12: Confirmed storage milestone boundary in `storage.rs` and removed Electron OAuth-default instructions from the provider dialog copy.

Done means:

- Cloud storage UI does not advertise Electron OAuth paths, and every selectable provider either works or is disabled.

### 14. Agents And ACP Providers

Status: profile/history migrated; provider execution pending.

Current Tauri code supports profiles/runs/history and provider discovery. Actual run/interrupt/resume/terminate returns migration-pending errors. Event streaming is exposed as a Tauri event subscription, but provider execution does not emit events until ACP process control is ported.

Checklist:

- [x] Remove `window.__ELECTRON__` dependency from `AgentsView`.
- [x] Implement `agents.onEvent` Tauri event stream or remove the renderer subscription.
- [ ] Implement provider process launch for allowlisted Codex/Claude provider identities.
- [ ] Implement run, interrupt, resume, and terminate. Current native commands are explicit migration-pending stubs covered by tests.
- [ ] Rebuild approval/permission integration for ACP events.
- [ ] Persist streamed events and final run state.
- [x] Keep browser/web mode as inspect-only.

Evidence to inspect:

- `tauri-app/src-tauri/src/agents.rs`
- `tauri-app/src/lib/agentRuntimeClient.ts`
- `tauri-app/src/components/agents/AgentsView.tsx`
- Old references: `src/lib/agents/**`, `docs/acp-providers.md`

Progress notes:

- 2026-09-12: Added `agents.onEvent` bridge subscription, added `terminate_agent_run`, and covered all execution commands as typed migration-pending stubs with a focused Rust test.
- 2026-09-12: Confirmed `AgentsView` requires the desktop bridge for launch, follow-up, interrupt, and resume actions, leaving non-desktop mode as inspect-only.

Done means:

- ACP providers can be discovered, launched, controlled, streamed, approved, and persisted natively, or the UI clearly says execution is pending.

### 15. Plugins

Status: registry migrated; execution host pending by design.

Checklist:

- [x] Decide whether plugin execution host is in this Tauri milestone. Decision: no; metadata management only.
- [x] If yes, port manifest validation, capability checking, signature/trust rules, health checks, and node discovery. Not in this milestone.
- [x] Provide host adapters for only allowed capabilities. Not applicable until the execution host is ported.
- [x] Keep plugins isolated from Prisma, raw secrets, Electron internals, and unrestricted desktop APIs.
- [x] Wire plugin workflow nodes only after host boundary exists.
- [x] If no, keep plugin execution disabled and visible as migration-pending.

Evidence to inspect:

- `tauri-app/src-tauri/src/plugins.rs`
- `tauri-app/src/lib/pluginsRuntimeClient.ts`
- `tauri-app/src/lib/plugins/**`
- `docs/plugins/SDK.md`
- `examples/plugins/**`

Progress notes:

- 2026-09-12: Kept the Tauri plugin host metadata-only, made settings UI advertise execution as migration-pending, and covered `run_plugin` as disabled with a focused Rust test.

Done means:

- Plugin management and execution claims match the actual Tauri host boundary.

### 16. Workspace Access And RBAC

Status: local-owner mode migrated; collaboration retired/pending.

Checklist:

- [x] Confirm workspace access UI copy matches local-only Tauri behavior.
- [x] Verify invitations and custom roles are either implemented or disabled based on local-owner decision.
- [x] Confirm `desktopCapabilities.workspaceAccess` reflects actual capability.
- [x] Remove Next request-context assumptions from any Tauri-visible RBAC flows.

Evidence to inspect:

- `tauri-app/src-tauri/src/workspace_access.rs`
- `tauri-app/src/lib/workspacesRuntimeClient.ts`
- `tauri-app/src/components/settings/WorkspaceAccessSection.tsx`
- Old reference: `src/lib/rbac/**`

Progress notes:

- 2026-09-12: Updated workspace access settings UI for local-owner mode, removed retired collaboration controls from the Tauri-visible surface, and verified the Rust local-owner model.

Done means:

- Workspace Access is either a truthful local admin view or a fully migrated collaboration feature.

### 17. Next/Web Runtime Leftovers

Status: guarded, but needs final cleanup before release.

Checklist:

- [x] Run `npm run guard:no-api-fallback` in `tauri-app`.
- [x] Audit `tauri-app/src/app/api/**`; keep only as reference if unavoidable.
- [x] Ensure no Tauri UI imports `NextRequest`, `NextResponse`, `next/navigation`, or server-only Prisma modules.
- [x] Keep `axios`/`fetch('/api/*')` reachable only in explicit web-mode code paths.
- [x] Consider moving old copied routes under a reference folder if they are not built into Tauri. Decision: keep in place as web/server reference routes while guards prevent Tauri runtime fallback.
- [x] Update documentation that still calls Electron the trusted local host.

Evidence to inspect:

- `tauri-app/src/app/api/**`
- `tauri-app/src/lib/*RuntimeClient.ts`
- `CLAUDE.md`
- `docs/operator-guide.md`
- `docs/troubleshooting.md`

Progress notes:

- 2026-09-12: `npm run guard:no-api-fallback`, `npx tsc --noEmit`, `npm run guard:desktop-bridge`, and `npm run build` pass in `tauri-app`.
- 2026-09-12: Audited Tauri-visible imports/API fallbacks, confirmed remaining server imports live in web/reference routes or guarded web-mode branches, and updated active docs from Electron-host language to Tauri-host language.

Done means:

- The Tauri bundle is not carrying accidental web server assumptions.

### 18. Release And Packaging Verification

Status: source proof exists from 2026-09-05, but rerun after every migration slice.

Required commands from `tauri-app`:

```powershell
npx tsc --noEmit
npm run build
npm run guard:no-api-fallback
```

Required commands from `tauri-app/src-tauri`:

```powershell
cargo test
```

Build gates:

```powershell
npm run tauri:build:no-bundle
npm run tauri:build
```

Manual smoke:

- [x] Launch `npx tauri dev`.
- [ ] Open every activity tab.
- [ ] Exercise Scripts create/edit/run/cancel and terminal input.
- [ ] Exercise API send and history.
- [ ] Exercise Workflow create/publish/run/cancel/retry.
- [ ] Exercise Git status/log/commit-safe flow.
- [ ] Exercise Settings sections.
- [ ] Exercise pending surfaces and confirm they do not crash.
- [x] Scan dev logs for missing command errors.
- [x] Record results in `docs/releases/`.

Progress notes:

- 2026-09-12: `npx tauri dev` started Vite on `http://localhost:1420`, compiled and launched `target\debug\scriptmanager.exe`, initialized the SQLite schema, loaded the initial scripts/collections/templates/notification-delivery data through native commands, and was stopped cleanly with Ctrl+C. No missing-command errors appeared in the captured startup logs. Full visual tab-by-tab smoke remains pending because this terminal run did not exercise the Tauri WebView UI.

Done means:

- Source/tests/builds pass.
- Visible Tauri app smoke passes.
- Every remaining external dependency is explicitly labeled as live-provider/manual pending.

## Current Migration-Pending Items To Prioritize

1. OS-native notification delivery and deep-link handling.
2. Google Drive and OneDrive OAuth in Tauri.
3. S3/GCS/WebDAV real sync/test transports if they are enabled in UI.
4. SSH/SCP transport for Ops remote execution.
5. ACP provider run/interrupt/resume/terminate and event streaming.
6. Plugin execution host and plugin workflow nodes.
7. Workflow remote/notification/agent/plugin node execution.
8. Git protected-operation approvals.
9. Clipboard and reveal-path helpers.
10. Electron naming cleanup (`__ELECTRON__`, `electron.d.ts`, docs).

## Suggested Commit Slices

1. `fix(tauri): clean desktop contract and compatibility flags`
2. `feat(tauri): add native clipboard and path reveal helpers`
3. `feat(tauri): wire native notifications and deep links`
4. `feat(tauri): migrate cloud storage OAuth flows`
5. `feat(tauri): implement SSH remote execution transport`
6. `feat(tauri): run ACP providers from native host`
7. `feat(tauri): add plugin execution host boundary`
8. `feat(tauri): complete workflow node parity`
9. `fix(tauri): route protected git actions through approvals`
10. `docs(tauri): refresh smoke evidence and release checklist`

## Handoff Note For Next Agent

Start with:

```powershell
git status --short --branch
jbcontext status
jbcontext search "Tauri Electron migration pending helpers OAuth notifications agents plugins remote execution"
```

Then pick exactly one checklist section, implement it end to end, and update this file plus `docs/releases/` with verification evidence.
