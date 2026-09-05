# ScriptManager Tauri Crash-Free Migration Plan - 2026-09-02

## Current Finding

The Tauri rewrite builds, but build success is not the right readiness signal yet. The app was migrated quickly from a Next/Electron architecture and still has three crash-prone seams:

1. The renderer still expects the old Electron desktop runtime shape.
2. Many runtime clients still fall back to `/api/*` routes when a desktop method is missing.
3. Rust currently implements only the first small command subset, so most non-startup surfaces are not true Tauri flows yet.

The first reproduced startup failure was:

```text
[Tauri IPC Polyfill] Failed get_bootstrap_state: Command get_bootstrap_state not found
[Tauri IPC Polyfill] Failed list_templates: Command list_templates not found
[Tauri IPC Polyfill] Failed list_tags: Command list_tags not found
[Tauri IPC Polyfill] Failed on_canonical_folder_change: Command on_canonical_folder_change not found
[Tauri IPC Polyfill] Failed on_build_event: Command on_build_event not found
```

That was caused by the renderer bridge making every `window.scriptManagerDesktop.runtime.*` property look available, even when Rust did not implement the command. This made feature detection lie, hid command errors, and let components continue with wrong data shapes.

## Fixed In The First Crash-Hardening Slice

- Replaced the generic runtime `Proxy` with an explicit Tauri bridge in `tauri-app/src/main.tsx`.
- Added Rust startup commands for:
  - `get_bootstrap_state`
  - `list_tags`
  - `list_templates`
- Added focused Rust tests proving empty startup data returns stable arrays/settings instead of missing-command failures.
- Verified `npx tauri dev` no longer prints the startup command-not-found errors during idle startup.

Verification after this slice:

- `npx tsc --noEmit` from `tauri-app`: passed.
- `cargo test` from `tauri-app/src-tauri`: passed, 2 tests.
- `npm run build` from `tauri-app`: passed with existing chunk-size/plugin-timing warnings only.
- `npx tauri dev` idle startup: passed the reproduced missing-command check; no new console errors appeared during the observed idle window.

## Remaining Migration Surface

### P0 - Startup And Shell Stability

Goal: the app can open, idle, switch core tabs, and show useful errors without crashing.

Required work:

- Keep `window.scriptManagerDesktop.runtime` explicit. Do not restore a catch-all proxy.
- Add a visible migration/error boundary around lazy-loaded workbench panels.
- Add a central `UnsupportedTauriFeatureError` for surfaces not migrated yet.
- Replace generic `null`/`[]` fallback behavior with typed empty states or explicit "not migrated yet" messages.
- Replace `window.__ELECTRON__` checks with a neutral desktop/Tauri capability check.
- Remove or quarantine the Vite-copied `src/app/api/**` route files from the active renderer bundle path.

### P1 - Scripts, Collections, Tags, Templates

Goal: the default Scripts workspace works without HTTP.

Required commands:

- `read_script`
- `save_script`
- `delete_script`
- `duplicate_script`
- `create_collection`
- `update_collection`
- `delete_collection`
- `move_script`
- `list_env`, `save_env`, `delete_env`
- `list_versions`, `read_version`
- `list_builds`, `read_build_output`
- `run_script`, `cancel_run`
- folder picker/open-folder/import-folder/scan flows

Important details:

- Use explicit SQL column lists, not `SELECT *`.
- Persist/update `updated_at` consistently.
- Keep file-system paths canonical and contained inside approved workspace roots.
- Script execution should emit build events through Tauri events, not web sockets.

### P2 - Terminal

Goal: terminal opens, accepts input, resizes, closes, and does not leak child processes.

Required work:

- Align renderer event subscriptions with Rust events. Current Rust emits `terminal-data-<sessionId>`, while renderer expects a higher-level `onTerminalEvent` contract.
- Add `close_terminal`.
- Store and terminate child processes, not only PTY handles.
- Emit `connected`, `data`, `closed`, and `error` events with a stable payload shape.
- Add Rust tests for PTY state bookkeeping where possible and manual smoke for real shells.

### P3 - API Client

Goal: API collections, requests, environments, globals, history, and send/run flows work through Rust.

Required commands:

- `list_api_collections`, `save_api_collection`, `delete_api_collection`
- `list_api_requests`, `save_api_request`, `delete_api_request`
- `list_api_environments`, `save_api_environment`, `delete_api_environment`
- `read_api_globals`, `save_api_globals`
- `send_api_request`
- `list_api_history`, `clear_api_history`
- `run_api_collection`, `list_api_collection_runs`

Important details:

- Use `reqwest` for execution, but keep request/response history persisted in SQLite.
- Preserve variable substitution, auth config, test scripts, and collection run summaries.
- Do not call copied Next route handlers from Tauri.

### P4 - Workflows And Observability

Goal: workflow editing can save/publish/run and observability shows real run state.

Required commands:

- `list_workflows`, `create_workflow`, `save_workflow`, `publish_workflow`
- `run_workflow`, `list_workflow_runs`, `read_workflow_run`
- `retry_workflow_node`, `cancel_workflow_run`
- `get_observability_dashboard`, `get_observability_run_detail`
- `cancel_observability_run`, `retry_observability_run`, `read_observability_log`

Important details:

- Current Rust `run_workflow_dag` is a stub and must not be treated as feature-complete.
- Reuse the existing TypeScript workflow graph semantics as the reference until Rust parity is proven.
- Node attempts, cancellation, retry, approval pauses, and redaction must be tested before calling this stable.

### P5 - Settings, Secrets, Approvals, Notifications

Goal: settings surfaces do not crash, and security-sensitive flows preserve the old desktop safety boundary.

Required commands:

- Gist settings read/save/clear.
- Secret list/create/rotate/disable/reveal/history/bind flows.
- Approval list/decision flows.
- Notification channels/rules/deliveries and desktop notification events.
- Workspace access and local role/session surfaces.

Important details:

- Do not store plaintext secrets in renderer state or logs.
- Desktop identity should be derived by Rust/Tauri context, not request bodies.
- Keep sensitive flows explicit and auditable.

### P6 - Git, Ops, Storage, Agents, Plugins

Goal: advanced workbench areas either work natively or show clear "migration pending" states.

Required work:

- Finish `run_git_action` parity beyond simple `git_status`/`git_log`.
- Rebuild remote execution without web SSE.
- Rebuild storage provider CRUD/test/sync without copied Next routes.
- Decide whether agents/plugins are in this Tauri milestone or temporarily disabled behind capability checks.
- Add feature gates so partially migrated screens cannot crash the app.

## Anti-Crash Rules For The Migration

- No catch-all IPC proxy.
- No silent `null` fallback for command failures.
- No `/api/*` fallback inside Tauri desktop mode unless an embedded server is intentionally running and tested.
- Every migrated runtime method gets a matching Rust command, a TypeScript client path, and at least one automated or manual proof.
- Event contracts must be named and typed; no ad hoc event names hidden inside components.
- All SQL uses explicit columns and handles empty databases.
- UI panels must render empty/error states for unsupported features.

## Verification Ladder

Use this order. Do not jump to final installers until earlier gates are stable.

1. `npx tsc --noEmit` from `tauri-app`.
2. Focused Rust tests for the current slice.
3. `cargo test` from `tauri-app/src-tauri`.
4. `npm run build` from `tauri-app`.
5. `npx tauri dev` idle startup log check.
6. Manual visible smoke for the current slice.
7. `npm run tauri:build:no-bundle` only after core flows are stable.
8. `npm run tauri:build` only after installer packaging becomes the actual target.

## Recommended Immediate Order

1. Finish P0 and P1 before touching packaging again.
2. Add terminal lifecycle correctness next, because terminal crashes can leave child processes behind.
3. Migrate API client storage/execution.
4. Migrate workflows only after scripts/API/terminal are stable.
5. Put advanced surfaces behind feature capability gates until their Rust command contracts exist.

For agent handoff and task-by-task execution, use the full master plan:

- `docs/superpowers/plans/2026-09-02-tauri-full-migration-master-plan.md`
