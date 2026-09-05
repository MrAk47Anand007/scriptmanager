# ScriptManager Tauri Migration Completion Plan — 2026-09-05

> **For agentic workers:** implement task-by-task, keep commits small, and run the verification ladder after every slice: `npx tsc --noEmit`, focused Rust tests, `cargo test`, `npm run build`, `npx tauri dev` surface smoke. Do not run installer packaging until all dev-mode smokes are stable.

**Goal:** Close the feature-parity gap between the legacy Electron/Next product (root `src/`, `prisma/schema.prisma`) and the Tauri app (`tauri-app/`) so every user-visible surface either works end-to-end in Tauri or is explicitly and visibly retired.

**Current state at plan time (branch `feat/tauri-rewrite`, head `5c4fb0b`):**

Migrated and working (Rust command + bridge + schema + smoke):
- Scripts workspace: CRUD, collections, tags, templates, env vars (with secret masking), versions, builds, `run_script`/`cancel_run` with `build-event` streaming
- Terminal: PTY lifecycle (`create/write/resize/close/set_terminal_context/run_script_in_terminal`), `terminal-event`
- API client: collections, requests, environments, globals, history, send, collection runs
- Workflows: CRUD, publish, run, retry, cancel, run records
- Git/source control: clone, status, log, `run_git_action`, probe
- Projects: CRUD + collection assignment
- Settings: read-only (`get_settings`)
- Infra: `error.rs`, `state.rs`, `schema.rs` (19 tables), `desktopCapabilities.ts`, `MigrationBoundary.tsx`, `tauriInvoke.ts`

**Parity gap inventory (from full comparison against the legacy app):**

| Feature | Renderer state | Backend state |
|---|---|---|
| Script schedules | Tab hard-disabled | `readSchedule/saveSchedule/deleteSchedule` throw `UnsupportedTauriFeatureError` |
| GitHub Gist sync + credentials | UI exists | `syncGist/deleteGist` throw; `readGistSettings` not in bridge |
| Script export/import | UI exists | No bridge methods; falls back to missing `/api` |
| Ops / remote execution | Panels exist (profiles, remote exec, audit) | Only projects CRUD; profiles/SSH/remote-exec/audit → `/api` |
| Secrets vault | Settings section exists | → `/api/secrets` |
| Approvals | ApprovalInbox exists, tab disabled | → `/api/approvals` |
| Observability dashboard | ExecutionDashboard exists, tab disabled | → `/api/observability/*` |
| Notifications | DesktopNotificationHost exists | → `/api/notifications` |
| Agents / ACP | AgentsView exists, tab disabled | `agents.*` not in bridge; CRUD → `/api/agents` |
| Cloud storage | CloudStorageSection exists | → `/api/storage-providers` |
| Plugins | PluginsSection exists | → `/api/plugins` |
| Workspace access / RBAC | Settings section exists | → `/api/workspaces` |
| Workflow triggers/webhooks | UI exists | Not implemented |
| Settings write | Tab disabled | Only `get_settings` exists |

Missing schema tables vs Prisma (44 models): `storage_providers`, `server_profiles`, `remote_executions`, `execution_events`, `workflow_triggers`, `notification_channels/rules/deliveries`, `approval_requests/decisions/grants`, `secrets`, `secret_versions`, `secret_bindings`, `secret_access_events`, `agent_*`, `users/workspaces/memberships/roles/role_permissions/workspace_invitations/user_sessions/permission_grants`, `plugin_packages/plugin_installations`.

**Scoping decisions (agreed):**

- **D1 — Drop multi-user RBAC.** This is a local desktop app. Do not port `users`, `workspaces`, `memberships`, `roles`, `role_permissions`, `workspace_invitations`, `user_sessions`, `permission_grants`. Implement a fixed local-owner workspace model (single implicit owner, no invitations). The Workspace Access settings section renders a stable explanatory state and its mutation buttons are disabled — not a crash, not fake data.
- **D2 — Local-first secrets.** Secrets are encrypted at rest with a Rust-side key stored in the OS-backed credential store (Tauri plugin or DPAPI/Keychain path chosen in Task S3 Step 1). Plaintext leaves Rust only in explicit reveal-once flows.
- **D3 — Approvals/notifications stay local.** Tauri-event notification delivery first; OS-native notifications via plugin only if trivially available.
- **D4 — Schedules are a real feature** (they exist in the legacy product), implemented with a tokio-based scheduler in Rust. If implementation exceeds the task budget, fall back to a durable "migration-pending" gate — never a silent no-op.
- **D5 — Web leftovers (Tasks W1) get removed, not preserved**: `socketService.ts`, `buildSocketService.ts`, `sshService.ts`, `schedulerService.ts`, desktop `/api/*` fallbacks, and `tauri-app/src/app/api/**` are quarantined or deleted once nothing references them.

---

### Task S1: Hygiene — Commit, Remove Dead Web Paths, Stabilize Terminal

**Files:**
- Commit: all current working-tree changes (Tasks 1–4 work + docs) — blocked only by the Mimosa pre-commit security gate; resolve per hook instructions, then commit.
- Modify/delete: `tauri-app/src/lib/socketService.ts`, `buildSocketService.ts`, `sshService.ts`, `schedulerService.ts`
- Modify: `tauri-app/src-tauri/src/terminal.rs`, `tauri-app/src/components/TerminalComponent.tsx`

**Steps:**
- [ ] S1.1 Clear the Mimosa security-gate findings flagged against legacy paths (`dist-electron/**` is stale build output of removed code — delete from repo and gitignore; test files use fixture credentials — annotate or refactor as the scan guidance directs). Rescan until sealed, then commit pending work as two commits: `docs(tauri): add rewrite handoff, crash-free spec, and full migration master plan` and the combined Tasks 1–4 feature commit.
- [ ] S1.2 Inventory all remaining `fetch('/api/...')`, `EventSource`, `WebSocket`, `io(` usage under `tauri-app/src` outside `app/api/**`; for each, either the owning feature migrates later in this plan (leave a typed unsupported path) or the file is deleted now.
- [ ] S1.3 Terminal correctness pass: keep child/master/writer handles per session, emit only `terminal-event` with `connected|data|closed|error`, close terminates the child and removes the session, resize on a missing session returns a controlled error. Rust test: create → write → close removes session; resize-after-close errors.
- [ ] S1.4 Verify: `cargo test`, `npx tsc --noEmit`, `npm run build`, `npx tauri dev` — open terminal, `echo hello`, resize, close, reopen; confirm no orphan `powershell.exe` child remains.

### Task S2: Settings Write + Gist Credentials + Script Export/Import

Unblocks the Settings tab and removes three "silent fallback" surfaces.

**Files:**
- Create: `tauri-app/src-tauri/src/settings.rs`
- Modify: `tauri-app/src-tauri/src/schema.rs` (extend `settings` table shape as needed), `lib.rs`, `state.rs`
- Modify: `tauri-app/src/lib/settingsRuntimeClient.ts`, `gistCredentialsRuntimeClient.ts`, `scriptsRuntimeClient.ts`, `tauri-app/src/main.tsx`, `tauri-app/src/app/page.tsx`

**Interfaces:** `read_settings`, `save_settings`, `read_github_gist_settings`, `save_github_gist_settings`, `clear_github_gist_settings`, `export_scripts`, `export_script`, `import_scripts`; bridge methods with matching camelCase names; flip `settings: true` in `desktopCapabilities.ts`.

**Steps:**
- [ ] S2.1 Rust tests: read defaults on empty DB → save → read round-trip; gist credential save/clear round-trip; export produces archive/JSON matching legacy shape; import inserts and reports counts.
- [ ] S2.2 Implement settings + gist credential commands; export uses `atomic_write_file`-style safe writes into the user-chosen path (Tauri dialog plugin if available, else app-data exports dir); import validates JSON before insert.
- [ ] S2.3 Wire renderer clients; remove desktop `/api` fallbacks in the three clients; enable the Settings tab shell (sections that remain unmigrated keep their pending states).
- [ ] S2.4 Verify: change a setting and observe persistence across app restart; save/clear gist token; export then import a script collection.

### Task S3: Secrets Vault

**Files:**
- Create: `tauri-app/src-tauri/src/security.rs`
- Modify: `schema.rs` (`secrets`, `secret_versions`, `secret_bindings`, `secret_access_events`), `lib.rs`
- Modify: `tauri-app/src/lib/secretsRuntimeClient.ts`, `tauri-app/src/components/settings` secrets section, `main.tsx`

**Interfaces:** `list_secrets` (never returns plaintext), `create_secret`, `rotate_secret`, `disable_secret`, `reveal_secret` (reveal-once).

**Steps:**
- [ ] S3.1 Choose and document the key store (OS keyring plugin preferred; fallback: DPAPI-encrypted key file in app data) — record the decision in this file.
- [ ] S3.2 Rust tests: list output contains no plaintext; create/rotate/disable lifecycle; reveal records an access event; binding resolution returns plaintext only to Rust-side consumers.
- [ ] S3.3 Implement commands + encrypted-at-rest storage; wire renderer; verify no plaintext reaches Redux state or logs.
- [ ] S3.4 Verify: create/rotate/disable/reveal in UI, restart app, secrets still resolve.

### Task S4: Schedules + Gist Sync

**Files:**
- Create: `tauri-app/src-tauri/src/scheduler.rs`
- Create or extend: `tauri-app/src-tauri/src/gist.rs`
- Modify: `schema.rs` (schedule columns/table), `lib.rs`, `state.rs`
- Modify: `tauri-app/src/lib/scriptsRuntimeClient.ts`, schedules view component, `page.tsx`

**Interfaces:** `read_schedule`, `save_schedule`, `delete_schedule`; scheduler tick loop persists due runs as normal `run_script` builds; `sync_gist`, `delete_gist` using stored gist credentials.

**Steps:**
- [ ] S4.1 Rust tests: cron/interval parsing; due-run scheduling creates a build row and respects cancel; missed-run policy (skip or run-once — match legacy behavior, record choice).
- [ ] S4.2 Implement tokio scheduler owned by app state; survives via DB (schedules are reloaded on startup).
- [ ] S4.3 Gist sync via `reqwest` + stored token; match legacy gist file naming; surface sync errors in UI.
- [ ] S4.4 Re-enable Schedules tab; verify: schedule a 1-minute script, observe build appears; disable schedule; sync collection to a test gist and delete it.

### Task S5: Observability Dashboard

Cheap win: builds, api_history, workflow_runs already persist.

**Files:**
- Create: `tauri-app/src-tauri/src/observability.rs`
- Modify: `schema.rs` (`execution_events`), `lib.rs`
- Modify: `tauri-app/src/lib/observabilityRuntimeClient.ts`, `ExecutionDashboard.tsx`, `page.tsx`

**Interfaces:** `get_observability_dashboard`, `get_observability_run_detail`, `cancel_observability_run`, `retry_observability_run`, `read_observability_log`.

**Steps:**
- [ ] S5.1 Rust tests: seed builds/API runs/workflow runs → active/succeeded/failed counts correct; log read is redacted (secret values masked).
- [ ] S5.2 Implement aggregation queries returning exactly the shape `ExecutionDashboard.tsx` consumes; write `execution_events` from execution paths going forward.
- [ ] S5.3 Cancel/retry delegate to script/workflow/API commands; unsupported kinds return typed errors.
- [ ] S5.4 Re-enable observability tab; verify: failed script run + successful API request both render; run detail and log open.

### Task S6: Approvals + Notifications

**Files:**
- Create: `tauri-app/src-tauri/src/approvals.rs`, `notifications.rs`
- Modify: `schema.rs` (approval + notification tables), `lib.rs`
- Modify: `tauri-app/src/lib/approvalsRuntimeClient.ts`, `notificationsRuntimeClient.ts`, `ApprovalInbox.tsx`, `DesktopNotificationHost.tsx`, `main.tsx`

**Interfaces:** `list_approvals`, `decide_approval`, `list/create_notification_channels`, `list/create_notification_rules`, `list_notification_deliveries`; event `notification-event`.

**Steps:**
- [ ] S6.1 Rust tests: approval decided once, immutable after decision; channel/rule/delivery persistence round-trip.
- [ ] S6.2 Implement commands; delivery adapter emits `notification-event` (Tauri event) and records a delivery row; hook rule evaluation into build/workflow/API run completion.
- [ ] S6.3 Re-enable approvals + notifications UI; verify: decision flow, delivery history renders seeded and empty states.

### Task S7: Ops — Server Profiles, Remote Execution, Audit

**Files:**
- Extend: `tauri-app/src-tauri/src/projects.rs` or create `ops.rs`
- Modify: `schema.rs` (`server_profiles`, `remote_executions`), `lib.rs`
- Modify: `tauri-app/src/lib/opsRuntimeClient.ts`, `ServerProfilesPanel.tsx`, `RemoteExecutionPanel.tsx`, `AuditTrailPanel.tsx`, `main.tsx`

**Interfaces:** `list/save/delete_server_profiles`, `test_server_profile_connection`, `transfer_remote_script`, `start/approve/reject_remote_execution`, `list_audit_log`; event `remote-exec-event`.

**Steps:**
- [ ] S7.1 Rust tests: profile CRUD + secret reference redaction; remote execution state machine (pending → approved/rejected → running → done/failed) with audit rows.
- [ ] S7.2 Choose SSH crate (`russh` or `ssh2`); implement connection test and command execution with **argument arrays / explicit command construction — no shell string interpolation of user input** (legacy `execCommand` was flagged as command injection; do not port that pattern).
- [ ] S7.3 Replace SSE in `RemoteExecutionPanel.tsx` with `remote-exec-event`; audit log reads from `remote_executions`/audit table.
- [ ] S7.4 Verify against a disposable local SSH target only: profile CRUD, connection test, approved command emits events + audit.

### Task S8: Storage Providers (Local First)

**Files:**
- Create: `tauri-app/src-tauri/src/storage.rs`
- Modify: `schema.rs` (`storage_providers`), `lib.rs`
- Modify: `tauri-app/src/lib/storageRuntimeClient.ts`, `CloudStorageSection.tsx`, `main.tsx`

**Interfaces:** `list/save/delete/test_storage_providers`, `sync_collection`.

**Steps:**
- [ ] S8.1 Rust tests: provider config persisted without secrets in list output; local-filesystem provider test + collection sync round-trip.
- [ ] S8.2 Implement local filesystem provider fully. S3/WebDAV: implement only if straightforward; otherwise gate with stable pending state. GDrive/OneDrive OAuth: **explicitly migration-pending** (D3/D5 decision — no fake OAuth).
- [ ] S8.3 Verify: create local provider, test, sync a collection, inspect synced files.

### Task S9: Agents (Profiles + History, Gated Execution) and Plugins (Management Shell)

**Files:**
- Create: `tauri-app/src-tauri/src/agents.rs`, `plugins.rs`
- Modify: `schema.rs` (agent + plugin tables), `lib.rs`
- Modify: `tauri-app/src/lib/agentRuntimeClient.ts`, `pluginsRuntimeClient.ts`, `AgentsView.tsx`, plugin settings components, `main.tsx`

**Interfaces:** `list/create_agent_profiles`, `list_agent_runs`, `read_agent_run`, `list/update/remove_plugins`.

**Steps:**
- [ ] S9.1 Agents: persist profiles/runs; provider **execution** stays feature-gated with a clear pending state; when ported, discovery allows only configured executables, never renderer-supplied commands.
- [ ] S9.2 Plugins: manifest parse tests (invalid manifest rejected); list/update/remove metadata; execution host stays disabled pending capability/RBAC/secret boundary port.
- [ ] S9.3 Verify: Agents tab opens, profile create works, unavailable provider shows pending not crash; plugin enable/disable survives refresh.

### Task W1: Web Leftovers Quarantine + Capability Truth

**Steps:**
- [ ] W1.1 `rg -n "NextResponse|NextRequest|from 'next/|/api/|EventSource|io\\(" tauri-app/src --glob "!app/api/**"` → only intentional web-mode remnants allowed; remove `tauri-app/src/app/api/**` to `docs/reference/next-api-routes/` or delete.
- [ ] W1.2 Ensure every false capability in `desktopCapabilities.ts` corresponds to a visible pending UI state, and every true capability has a real Rust command. Add a guard test that fails when a runtime client gains a desktop `/api/*` fallback.
- [ ] W1.3 Verify: `npx tsc --noEmit`, `npm run build`, all tabs clicked once in `npx tauri dev` with no crash and no missing-command errors in logs.

### Task W2: Full Smoke + Handoff

- [ ] W2.1 Run full ladder: `npx tsc --noEmit`, `cargo test`, `npm run build`.
- [ ] W2.2 `npx tauri dev` smoke across every surface listed in W1.2; record pass/blocked/pending per surface in `docs/releases/tauri-smoke-2026-09-05.md`.
- [ ] W2.3 Update `docs/superpowers/handoffs/2026-09-02-tauri-rewrite.md` with final status; only then consider installer packaging on request.

---

## Execution Notes

- Start each task from a clean committed tree; one commit (or a few) per task with conventional messages (`feat(tauri): ...`).
- The Mimosa pre-commit security hook scans the whole repo — expect it to demand rescan; fix or annotate findings before committing rather than bypassing.
- Never reintroduce the catch-all runtime Proxy; no silent `null`/`[]` fallbacks; no desktop `/api/*` fallbacks.
- Legacy reference material: root `src/app/api/**` route handlers, `prisma/schema.prisma`, root `src/lib/**`.
- Explicitly retired in this milestone: multi-user RBAC/workspace collaboration (D1), GDrive/OneDrive OAuth (D3), agent/plugin execution hosts (S9).
