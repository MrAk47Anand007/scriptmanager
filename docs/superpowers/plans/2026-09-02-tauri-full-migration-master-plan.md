# ScriptManager Tauri Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the full ScriptManager product surface to a crash-free Tauri desktop application with explicit Rust commands, typed renderer clients, feature gates for unfinished surfaces, and repeatable verification before any final installer/release work.

**Architecture:** Treat `tauri-app/` as the active product path. The React renderer talks only to typed runtime clients; Tauri commands call Rust services/repositories; web/Next route files are reference material only until intentionally removed or quarantined. Partially migrated features must render stable pending/error states instead of falling through to `/api/*`, fake empty data, or missing IPC methods.

**Tech Stack:** Tauri 2, Rust 2021, `sqlx` SQLite, `tokio`, `portable-pty`, `notify`, `git2`, `reqwest`, `boa_engine`, Vite 8, React 19, Redux Toolkit, TypeScript 6.

**Spec:** `docs/superpowers/plans/2026-09-02-tauri-crash-free-migration.md`

## Global Constraints

- Do not run final exe/installer packaging as the success gate while migration paths are unstable.
- Keep `window.scriptManagerDesktop.runtime` explicit; never restore the catch-all runtime Proxy.
- No silent `null` or `[]` fallback for command failures in Tauri desktop mode.
- No `/api/*` fallback inside Tauri desktop mode unless an embedded server is intentionally reintroduced, documented, and tested.
- Every migrated runtime method needs a matching Rust command, typed TypeScript client, and proof.
- Every unsupported feature needs a visible stable UI state, not a crash.
- Event contracts must be named and typed; avoid component-private event names.
- SQL must use explicit column lists and handle empty databases.
- Preserve unrelated working-tree changes. Current branch is `feat/tauri-rewrite`.
- Use this verification ladder for each slice: `npx tsc --noEmit`, focused Rust tests, `cargo test`, `npm run build`, `npx tauri dev` idle/surface smoke. Run packaging only when requested after stability.

---

## File Structure

Create these Rust modules to keep migration work small and reviewable:

- `tauri-app/src-tauri/src/error.rs` - shared `AppError`, `AppResult<T>`, and conversion into Tauri-safe strings.
- `tauri-app/src-tauri/src/state.rs` - app state structs for SQLite pool, app paths, terminal state, event emitters, and feature capabilities.
- `tauri-app/src-tauri/src/schema.rs` - startup schema validation, migration/bootstrap helpers, and table existence checks.
- `tauri-app/src-tauri/src/scripts.rs` - scripts, collections, tags, templates, env vars, versions, builds, and script execution command handlers.
- `tauri-app/src-tauri/src/terminal.rs` - terminal lifecycle, child process ownership, input, resize, close, and terminal events.
- `tauri-app/src-tauri/src/api_client.rs` - API collections, requests, environments, globals, history, request send, and collection runs.
- `tauri-app/src-tauri/src/workflows.rs` - workflow CRUD, validation, publish, run, cancel, retry, and workflow-run records.
- `tauri-app/src-tauri/src/observability.rs` - dashboard summaries, run details, redacted logs, retry/cancel adapters.
- `tauri-app/src-tauri/src/security.rs` - local actor/workspace context, secrets, approvals, audit attribution.
- `tauri-app/src-tauri/src/notifications.rs` - desktop notification channels/rules/deliveries and notification event emitters.
- `tauri-app/src-tauri/src/git_ops.rs` - expand from simple clone/log/status into full source-control workbench commands.
- `tauri-app/src-tauri/src/ops.rs` - projects, server profiles, remote execution, remote events, and audit log.
- `tauri-app/src-tauri/src/storage.rs` - storage provider CRUD/test/sync and OAuth token plumbing.
- `tauri-app/src-tauri/src/agents.rs` - ACP provider discovery/runs/profiles, initially feature-gated if real providers are not wired.
- `tauri-app/src-tauri/src/plugins.rs` - plugin list/update/remove and plugin capability status, initially feature-gated if host execution is not wired.

Create these renderer/runtime files:

- `tauri-app/src/lib/desktopCapabilities.ts` - central capability map returned by the explicit bridge.
- `tauri-app/src/lib/unsupportedTauriFeature.ts` - typed error class and helpers.
- `tauri-app/src/lib/tauriInvoke.ts` - small wrapper for Tauri invoke with normalized errors.
- `tauri-app/src/components/MigrationBoundary.tsx` - panel error boundary and pending-feature UI.
- `tauri-app/src/lib/*RuntimeClient.ts` - keep one client per domain; remove desktop `/api/*` fallbacks as each surface migrates.
- `tauri-app/src/features/*/*.ts` - update thunks to call runtime clients rather than direct `axios('/api/...')`.

Reference files, not active runtime targets:

- `tauri-app/src/app/api/**` - copied Next route handlers. Use only to understand prior behavior. Do not call them from Tauri.
- Root `prisma/schema.prisma` and migrations - authoritative schema reference until Rust migration/bootstrap is fully owned.
- Existing root `src/lib/**` - TypeScript behavior reference for workflows, security, approvals, notifications, agents, plugins, and storage.

---

### Task 1: Runtime Contract And Feature Gates

**Files:**
- Create: `tauri-app/src/lib/desktopCapabilities.ts`
- Create: `tauri-app/src/lib/unsupportedTauriFeature.ts`
- Create: `tauri-app/src/lib/tauriInvoke.ts`
- Create: `tauri-app/src/components/MigrationBoundary.tsx`
- Modify: `tauri-app/src/main.tsx`
- Modify: `tauri-app/src/app/page.tsx`

**Interfaces:**
- Produces: `desktopCapabilities: Record<string, boolean>`
- Produces: `class UnsupportedTauriFeatureError extends Error`
- Produces: `invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T>`
- Produces: `<MigrationBoundary feature="Scripts"><Panel /></MigrationBoundary>`
- Consumes: existing explicit bridge in `tauri-app/src/main.tsx`

- [x] **Step 1: Write the failing renderer test or smoke harness**

If a renderer test harness is not configured, create a small compile-safe test module and validate through TypeScript:

```ts
// tauri-app/src/lib/unsupportedTauriFeature.ts
export class UnsupportedTauriFeatureError extends Error {
  constructor(feature: string) {
    super(`${feature} is not migrated to Tauri yet`)
    this.name = 'UnsupportedTauriFeatureError'
  }
}
```

Expected production change that makes this fail: deleting the class or changing its `name`.

- [x] **Step 2: Add the capability map**

```ts
export const desktopCapabilities = {
  startup: true,
  scripts: false,
  collections: false,
  terminal: false,
  apiClient: false,
  workflows: false,
  observability: false,
  approvals: false,
  secrets: false,
  notifications: false,
  git: false,
  ops: false,
  storage: false,
  agents: false,
  plugins: false,
  workspaceAccess: false,
} as const
```

- [x] **Step 3: Add `invokeTauri` error normalization**

```ts
import { invoke } from '@tauri-apps/api/core'

export async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, payload ?? {})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Tauri command ${command} failed: ${message}`)
  }
}
```

- [x] **Step 4: Wrap lazy panels with `MigrationBoundary`**

Use a class error boundary that renders a compact panel with the feature name and error message. Do not include stack traces in the UI.

- [x] **Step 5: Remove false feature availability**

In `tauri-app/src/main.tsx`, expose only methods that have Rust commands. Do not use a `Proxy`. Optional methods must be absent until implemented.

- [x] **Step 6: Verify**

Run:

```powershell
cd tauri-app
npx tsc --noEmit
npm run build
```

Expected: both pass. Start `npx tauri dev` and switch every activity tab once. Expected: unsupported tabs show controlled pending/error states, not blank screens or crashes.

Completed 2026-09-02: `npx tsc --noEmit`, `npm run build`, `cargo test`, and `npx tauri dev` startup smoke passed. Startup logs showed normal SQLite reads and no missing-command errors. Full visible tab-click smoke remains part of Task 17 because no UI automation was attached during this slice.

- [ ] **Step 7: Commit**

```powershell
git add tauri-app/src/main.tsx tauri-app/src/app/page.tsx tauri-app/src/lib/desktopCapabilities.ts tauri-app/src/lib/unsupportedTauriFeature.ts tauri-app/src/lib/tauriInvoke.ts tauri-app/src/components/MigrationBoundary.tsx
git commit -m "fix(tauri): add explicit runtime capabilities and migration boundaries"
```

---

### Task 2: SQLite Schema Bootstrap And App Paths

**Files:**
- Create: `tauri-app/src-tauri/src/error.rs`
- Create: `tauri-app/src-tauri/src/state.rs`
- Create: `tauri-app/src-tauri/src/schema.rs`
- Modify: `tauri-app/src-tauri/src/db.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Test: `tauri-app/src-tauri/src/schema.rs`

**Interfaces:**
- Produces: `pub type AppResult<T> = Result<T, AppError>`
- Produces: `pub struct AppPaths { pub data_dir: PathBuf, pub db_path: PathBuf, pub scripts_dir: PathBuf, pub builds_dir: PathBuf }`
- Produces: `pub async fn ensure_schema(pool: &SqlitePool) -> AppResult<()>`
- Consumes: root `prisma/schema.prisma` table/column names.

- [x] **Step 1: Write failing schema test**

```rust
#[tokio::test]
async fn ensure_schema_creates_startup_tables() {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();

    ensure_schema(&pool).await.unwrap();

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('scripts', 'collections', 'tags', 'script_templates')",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 4);
}
```

Run: `cargo test ensure_schema_creates_startup_tables`
Expected: FAIL because `ensure_schema` does not exist.

- [x] **Step 2: Implement `AppError`**

Keep it simple:

```rust
pub enum AppError {
    Database(sqlx::Error),
    Io(std::io::Error),
    InvalidInput(String),
    Unsupported(String),
}
```

Implement `Display`, `From<sqlx::Error>`, `From<std::io::Error>`, and `type AppResult<T>`.

- [x] **Step 3: Implement path resolution**

Use Tauri app data paths when available. In dev, keep compatibility with `../../data/scriptmanager.db`, but ensure parent directories exist.

- [x] **Step 4: Implement `ensure_schema`**

Create the minimum schema needed for currently migrated features first: scripts, collections, tags, script_tags, script_env_vars, script_versions, builds, script_templates, settings. Use `CREATE TABLE IF NOT EXISTS`.

- [x] **Step 5: Call `ensure_schema` during `init_db`**

After pool creation, call `ensure_schema(&pool).await?`.

- [x] **Step 6: Verify**

Run:

```powershell
cd tauri-app/src-tauri
cargo test ensure_schema_creates_startup_tables
cargo test
```

Expected: tests pass. Then run `npx tauri dev`; expected: startup does not fail on missing tables even when DB is empty.

Completed 2026-09-02: added `error.rs`, `state.rs`, and `schema.rs`; `init_db` now resolves Tauri app data paths, creates local data/script/build directories, opens `scriptmanager.db`, and runs `ensure_schema`. Verification passed: `cargo test ensure_schema_creates_startup_tables -- --nocapture`, `cargo test`, `npx tsc --noEmit`, `npm run build`, and `npx tauri dev` startup smoke. Dev logs showed `CREATE TABLE IF NOT EXISTS` for startup/core tables followed by successful reads for scripts, collections, templates, and tags.

- [ ] **Step 7: Commit**

```powershell
git add tauri-app/src-tauri/src/error.rs tauri-app/src-tauri/src/state.rs tauri-app/src-tauri/src/schema.rs tauri-app/src-tauri/src/db.rs tauri-app/src-tauri/src/lib.rs
git commit -m "feat(tauri): bootstrap local sqlite schema and app paths"
```

---

### Task 3: Scripts, Collections, Tags, Templates Parity

**Files:**
- Create: `tauri-app/src-tauri/src/scripts.rs`
- Modify: `tauri-app/src-tauri/src/commands.rs` or move existing script commands into `scripts.rs`
- Modify: `tauri-app/src-tauri/src/models.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/scriptsRuntimeClient.ts`
- Modify: `tauri-app/src/features/scripts/scriptsSlice.ts`

**Interfaces:**
- Produces Rust commands: `list_scripts`, `read_script`, `create_script`, `save_script`, `delete_script`, `duplicate_script`, `list_collections`, `create_collection`, `update_collection`, `delete_collection`, `move_script`, `list_tags`, `add_tag`, `remove_tag`, `list_templates`, `save_template`, `delete_template`.
- Produces TS runtime methods with the same camelCase names used by existing components.

- [x] **Step 1: Write Rust CRUD tests**

Add tests for create/read/update/delete script, create/update/delete collection, move script, add/remove tag, save/delete template.

- [x] **Step 2: Implement SQL with explicit columns**

For scripts, read/write at least: `id`, `name`, `filename`, `description`, `language`, `source_path`, `parameters`, `collection_id`, `updated_at`.

- [x] **Step 3: Update TS clients**

Replace direct `axios('/api/scripts')`, `axios('/api/collections')`, `axios('/api/tags')`, and template calls in desktop mode with runtime client calls. In Tauri, do not fall back to `/api/*`.

- [x] **Step 4: Add controlled unsupported paths**

If Gist sync, schedule, env, versions, or build output are not implemented in this task, throw `UnsupportedTauriFeatureError('Script schedules')` or the precise feature name from the runtime client.

Completed 2026-09-02: added Rust helper tests for script CRUD, collection CRUD/delete/move, tags, and templates. Implemented Rust commands for `read_script`, `save_script`, `delete_script`, `duplicate_script`, `create_collection`, `update_collection`, `delete_collection`, `move_script`, `add_tag`, `remove_tag`, `save_template`, and `delete_template`, then registered them in the Tauri handler and explicit renderer bridge. Updated the scripts runtime client so desktop script/collection list calls go through the bridge, and converted Gist/schedule unsupported paths to `UnsupportedTauriFeatureError`. Added local Tauri `scripts.content` schema support with an `ALTER TABLE` guard for existing dev DBs.

- [ ] **Step 5: Verify**

Run:

```powershell
cd tauri-app
npx tsc --noEmit
cd src-tauri
cargo test scripts
cd ..
npm run build
npx tauri dev
```

- [x] Automated smoke: create script, rename/update script, create collection, move script, tag script, create/delete template, refresh app.

Manual smoke: when native UI control is available, click through create script, rename/update script, create collection, move script, tag script, create/delete template, and refresh app.

Automated/core verification completed 2026-09-02: `cargo test commands::tests -- --nocapture`, `cargo test`, `npx tsc --noEmit`, `npm run build`, and `npx tauri dev` startup smoke passed. `npx tauri dev` showed existing DB migration for `scripts.content` and successful reads for scripts, collections, tags, and templates. Added `task3_crud_smoke_matches_visible_flow` to cover create script, rename/update script, create collection, move script, tag script, create/delete template, and refresh data. Native visible click-through is still recommended, but this step is covered by automated command-level smoke in this environment.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/scripts.rs tauri-app/src-tauri/src/models.rs tauri-app/src-tauri/src/lib.rs tauri-app/src/lib/scriptsRuntimeClient.ts tauri-app/src/features/scripts/scriptsSlice.ts
git commit -m "feat(tauri): migrate scripts workspace core CRUD"
```

---

### Task 4: Script Env, Versions, Builds, And Execution Events

**Files:**
- Modify: `tauri-app/src-tauri/src/scripts.rs`
- Modify: `tauri-app/src-tauri/src/execution.rs`
- Modify: `tauri-app/src/lib/scriptsRuntimeClient.ts`
- Modify: `tauri-app/src/components/ScriptsManager.tsx`

**Interfaces:**
- Produces commands: `list_env`, `save_env`, `delete_env`, `list_versions`, `read_version`, `list_builds`, `read_build_output`, `run_script`, `cancel_run`.
- Produces event: `build-event` with payload `{ type, buildId, line?, status?, exitCode?, message? }`.

- [ ] **Step 1: Write tests for env and versions**

Test secret env values are stored but not leaked in list output if existing UI expects masking.

- [ ] **Step 2: Write tests for build records**

Test `run_script` creates a build row with `started`/`pending`, writes output path, and finalizes status.

- [ ] **Step 3: Implement script process execution**

Use `tokio::process::Command`. Resolve interpreter by language. Stream stdout/stderr into build events and log files.

- [ ] **Step 4: Replace WebSocket build stream usage**

In `ScriptsManager.tsx`, rely on `onBuildEvent` in Tauri mode. Only use WebSocket in web mode.

- [ ] **Step 5: Verify**

Manual smoke: run a tiny Python or Node script, see live output, inspect build history, cancel a long-running script.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/scripts.rs tauri-app/src-tauri/src/execution.rs tauri-app/src/lib/scriptsRuntimeClient.ts tauri-app/src/components/ScriptsManager.tsx
git commit -m "feat(tauri): migrate script execution and build events"
```

---

### Task 5: Terminal Lifecycle

**Files:**
- Modify: `tauri-app/src-tauri/src/terminal.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/main.tsx`
- Modify: `tauri-app/src/components/TerminalComponent.tsx`

**Interfaces:**
- Produces commands: `create_terminal`, `write_terminal`, `resize_terminal`, `close_terminal`, `set_terminal_context`, `run_script_in_terminal`.
- Produces event: `terminal-event` with payload matching `ScriptManagerDesktopTerminalEvent`.

- [ ] **Step 1: Write terminal state tests**

Test create inserts session, close removes session, resize on missing session returns a controlled error.

- [ ] **Step 2: Store child process handles**

Change `TerminalState` to keep master, writer, and child handle per session. Close must terminate child and remove session.

- [ ] **Step 3: Emit stable events**

Emit `connected`, `data`, `closed`, and `error` through one `terminal-event` channel. Do not emit dynamic event names like `terminal-data-{id}`.

- [ ] **Step 4: Update renderer**

`TerminalComponent.tsx` should not open `/api/terminal` WebSocket in Tauri mode.

- [ ] **Step 5: Verify**

Manual smoke: open terminal, run `echo hello`, resize, close, reopen, ensure no orphan `powershell.exe` child remains.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/terminal.rs tauri-app/src-tauri/src/lib.rs tauri-app/src/main.tsx tauri-app/src/components/TerminalComponent.tsx
git commit -m "feat(tauri): stabilize terminal lifecycle and events"
```

---

### Task 6: API Client Workspace

**Files:**
- Create: `tauri-app/src-tauri/src/api_client.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/apiRuntimeClient.ts`
- Modify: `tauri-app/src/features/api/apiSlice.ts`

**Interfaces:**
- Produces commands listed in the P3 section of `2026-09-02-tauri-crash-free-migration.md`.
- Consumes: `reqwest::Client` for execution.

- [ ] **Step 1: Write CRUD tests for API collections/requests/environments**

Use in-memory SQLite and assert persisted JSON strings round-trip.

- [ ] **Step 2: Write send-request test with injected/mockable transport**

If transport injection is too large, keep `send_api_request` isolated and manually smoke against `https://httpbin.org/get` later.

- [ ] **Step 3: Implement persistence commands**

Mirror root schema fields for `api_collections`, `api_requests`, `api_environments`, `api_history`, and `api_collection_runs`.

- [ ] **Step 4: Update `apiRuntimeClient.ts`**

Remove desktop `/api/*` fallback. Keep web fallback only behind a web-mode predicate.

- [ ] **Step 5: Verify**

Manual smoke: create collection, create request, send GET request, inspect history, run collection.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/api_client.rs tauri-app/src-tauri/src/lib.rs tauri-app/src/lib/apiRuntimeClient.ts tauri-app/src/features/api/apiSlice.ts
git commit -m "feat(tauri): migrate API client workspace"
```

---

### Task 7: Git Projects And Source Control

**Files:**
- Modify: `tauri-app/src-tauri/src/git_ops.rs`
- Create: `tauri-app/src-tauri/src/projects.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/gitRuntimeClient.ts`
- Modify: `tauri-app/src/features/git/gitSlice.ts`
- Modify: `tauri-app/src/components/git/SourceControlWorkbench.tsx`

**Interfaces:**
- Produces commands: `list_projects`, `save_project`, `delete_project`, `assign_collection_to_project`, `run_git_action`, `git_probe`, `git_clone`.
- Produces Rust enum/action shape compatible with `tauri-app/src/lib/git/types.ts`.

- [ ] **Step 1: Write tests for path containment and git action dispatch**

Use a temp git repository. Test `status`, `log`, branch read, and invalid action rejection.

- [ ] **Step 2: Implement project persistence**

Persist repository root, default branch, remote URL, workspace policy.

- [ ] **Step 3: Implement `run_git_action`**

Support status, diff, fetch, branch, checkout, commit, pull, push in small sub-functions. Use argument arrays, not shell command strings.

- [ ] **Step 4: Update renderer**

Remove direct `/api/git/probe` and `/api/git/clone` from Tauri mode.

- [ ] **Step 5: Verify**

Manual smoke with disposable repo: status, diff, branch, commit on disposable branch. Do not push real remotes without explicit approval.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/git_ops.rs tauri-app/src-tauri/src/projects.rs tauri-app/src/lib/gitRuntimeClient.ts tauri-app/src/features/git/gitSlice.ts tauri-app/src/components/git/SourceControlWorkbench.tsx
git commit -m "feat(tauri): migrate source control workbench"
```

---

### Task 8: Workflows Runtime

**Files:**
- Create: `tauri-app/src-tauri/src/workflows.rs`
- Modify: `tauri-app/src-tauri/src/execution.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/workflowsRuntimeClient.ts`
- Modify: `tauri-app/src/components/workflows/WorkflowBuilder.tsx`

**Interfaces:**
- Produces commands: `list_workflows`, `create_workflow`, `save_workflow`, `publish_workflow`, `run_workflow`, `list_workflow_runs`, `read_workflow_run`, `retry_workflow_node`, `cancel_workflow_run`.

- [ ] **Step 1: Port workflow validation tests**

Use existing TypeScript workflow graph tests as behavioral reference. Write Rust tests for acyclic validation, missing node rejection, invalid edge rejection, and deterministic plan order.

- [ ] **Step 2: Implement workflow CRUD**

Persist draft definitions and immutable published versions.

- [ ] **Step 3: Replace `run_workflow_dag` stub**

Run script/API/condition/transform/delay nodes first. For unsupported node types, fail the run with a typed unsupported error and persisted node error.

- [ ] **Step 4: Implement run state**

Persist run/node status, attempts, inputs, outputs, errors, timestamps, cancellation, retry.

- [ ] **Step 5: Verify**

Manual smoke: create workflow with API or script node, save, publish, run, inspect result, retry failed node, cancel running delay.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/workflows.rs tauri-app/src-tauri/src/execution.rs tauri-app/src/lib/workflowsRuntimeClient.ts tauri-app/src/components/workflows/WorkflowBuilder.tsx
git commit -m "feat(tauri): migrate workflow runtime"
```

---

### Task 9: Observability Dashboard

**Files:**
- Create: `tauri-app/src-tauri/src/observability.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/observabilityRuntimeClient.ts`
- Modify: `tauri-app/src/components/observability/ExecutionDashboard.tsx`

**Interfaces:**
- Produces commands: `get_observability_dashboard`, `get_observability_run_detail`, `cancel_observability_run`, `retry_observability_run`, `read_observability_log`.

- [ ] **Step 1: Write dashboard aggregation tests**

Seed script builds, API history/runs, workflow runs, and execution events. Assert active/succeeded/failed counts and redacted log behavior.

- [ ] **Step 2: Implement aggregation queries**

Return the shape expected by `ExecutionDashboard.tsx`.

- [ ] **Step 3: Wire cancel/retry to scripts/workflows/API**

Unsupported kinds return a typed unsupported error, not `null`.

- [ ] **Step 4: Verify**

Manual smoke: create failed script run and successful API run; dashboard displays both.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/observability.rs tauri-app/src/lib/observabilityRuntimeClient.ts tauri-app/src/components/observability/ExecutionDashboard.tsx
git commit -m "feat(tauri): migrate observability dashboard"
```

---

### Task 10: Settings, Secrets, Gist, And Workspace Access

**Files:**
- Create: `tauri-app/src-tauri/src/settings.rs`
- Create: `tauri-app/src-tauri/src/security.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/settingsRuntimeClient.ts`
- Modify: `tauri-app/src/lib/secretsRuntimeClient.ts`
- Modify: `tauri-app/src/lib/gistCredentialsRuntimeClient.ts`
- Modify: `tauri-app/src/lib/workspacesRuntimeClient.ts`
- Modify: `tauri-app/src/components/settings/*.tsx`

**Interfaces:**
- Produces commands: `read_settings`, `save_settings`, `read_github_gist_settings`, `save_github_gist_settings`, `clear_github_gist_settings`, `list_secrets`, `create_secret`, `rotate_secret`, `disable_secret`, `reveal_secret`, `list_workspace_access`, `create_workspace_invitation`, `revoke_workspace_grants`, `create_workspace_role`.

- [ ] **Step 1: Write settings persistence tests**

Test read default settings, save settings, read after save.

- [ ] **Step 2: Write secret redaction tests**

Test `list_secrets` never returns plaintext and access events are recorded.

- [ ] **Step 3: Implement local encryption**

For the first Tauri milestone, use a Rust-side encryption key stored in app local data or OS-backed storage if a Tauri plugin is added intentionally. Do not expose plaintext to renderer except reveal-once flows.

- [ ] **Step 4: Feature-gate workspace collaboration**

If multi-user workspace access is not part of this local Tauri milestone, return a stable local-owner workspace model and disable invite/session mutation buttons with explanatory UI state.

- [ ] **Step 5: Verify**

Manual smoke: change theme/settings, configure/clear Gist token, create/rotate/disable secret, open Workspace Access without crash.

- [ ] **Step 6: Commit**

```powershell
git add tauri-app/src-tauri/src/settings.rs tauri-app/src-tauri/src/security.rs tauri-app/src/lib/settingsRuntimeClient.ts tauri-app/src/lib/secretsRuntimeClient.ts tauri-app/src/lib/gistCredentialsRuntimeClient.ts tauri-app/src/lib/workspacesRuntimeClient.ts tauri-app/src/components/settings
git commit -m "feat(tauri): migrate settings and local security surfaces"
```

---

### Task 11: Approvals And Notifications

**Files:**
- Create: `tauri-app/src-tauri/src/approvals.rs`
- Create: `tauri-app/src-tauri/src/notifications.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/approvalsRuntimeClient.ts`
- Modify: `tauri-app/src/lib/notificationsRuntimeClient.ts`
- Modify: `tauri-app/src/components/approvals/ApprovalInbox.tsx`
- Modify: `tauri-app/src/components/notifications/DesktopNotificationHost.tsx`

**Interfaces:**
- Produces commands: `list_approvals`, `decide_approval`, `list_notification_channels`, `create_notification_channel`, `list_notification_rules`, `create_notification_rule`, `list_notification_deliveries`.
- Produces event: `notification-event`.

- [ ] **Step 1: Write approval decision tests**

Test pending approval can be allowed/rejected once, immutable after decision.

- [ ] **Step 2: Write notification delivery tests**

Test channel/rule creation and delivery record persistence.

- [ ] **Step 3: Implement local notification adapter**

Use Tauri events first. OS-native notifications can be a later explicit plugin task.

- [ ] **Step 4: Verify**

Manual smoke: approval inbox opens, decision updates state, notification settings opens, delivery history renders empty and seeded states.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/approvals.rs tauri-app/src-tauri/src/notifications.rs tauri-app/src/lib/approvalsRuntimeClient.ts tauri-app/src/lib/notificationsRuntimeClient.ts tauri-app/src/components/approvals tauri-app/src/components/notifications
git commit -m "feat(tauri): migrate approvals and notifications"
```

---

### Task 12: Ops, Remote Execution, And Audit

**Files:**
- Create: `tauri-app/src-tauri/src/ops.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/opsRuntimeClient.ts`
- Modify: `tauri-app/src/components/OpsView.tsx`
- Modify: `tauri-app/src/components/RemoteExecutionPanel.tsx`

**Interfaces:**
- Produces commands: `list_server_profiles`, `save_server_profile`, `delete_server_profile`, `test_server_profile_connection`, `transfer_remote_script`, `start_remote_execution`, `approve_remote_execution`, `reject_remote_execution`, `list_audit_log`.
- Produces event: `remote-exec-event`.

- [ ] **Step 1: Write profile CRUD tests**

Test create/update/delete server profile and secret reference behavior.

- [ ] **Step 2: Implement remote command execution carefully**

Use `ssh2` equivalent in Rust only after choosing a crate. If not selected, feature-gate remote execution and keep profile CRUD stable.

- [ ] **Step 3: Replace SSE usage**

`RemoteExecutionPanel.tsx` must not use `EventSource('/api/ops/remote-exec/...')` in Tauri mode.

- [ ] **Step 4: Verify**

Manual smoke: profile CRUD, connection test against a non-production target, approved command emits audit and events.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/ops.rs tauri-app/src/lib/opsRuntimeClient.ts tauri-app/src/components/OpsView.tsx tauri-app/src/components/RemoteExecutionPanel.tsx
git commit -m "feat(tauri): migrate ops and remote execution shell"
```

---

### Task 13: Storage Providers And OAuth

**Files:**
- Create: `tauri-app/src-tauri/src/storage.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/storageRuntimeClient.ts`
- Modify: `tauri-app/src/components/settings/CloudStorageSection.tsx`

**Interfaces:**
- Produces commands: `list_storage_providers`, `save_storage_provider`, `delete_storage_provider`, `test_storage_provider`, `sync_collection`.

- [ ] **Step 1: Write provider CRUD tests**

Test config is persisted encrypted/redacted and list output omits secrets.

- [ ] **Step 2: Implement local provider persistence**

Support local filesystem provider first. S3/WebDAV/GDrive/OneDrive can be migrated after config and test contracts are stable.

- [ ] **Step 3: OAuth decision**

Either add a Tauri OAuth plugin intentionally or mark GDrive/OneDrive OAuth as migration-pending with stable UI. Do not pretend Electron OAuth functions exist.

- [ ] **Step 4: Verify**

Manual smoke: create local provider, test provider, sync collection.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/storage.rs tauri-app/src/lib/storageRuntimeClient.ts tauri-app/src/components/settings/CloudStorageSection.tsx
git commit -m "feat(tauri): migrate storage provider foundation"
```

---

### Task 14: Agents And ACP Providers

**Files:**
- Create: `tauri-app/src-tauri/src/agents.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/agentRuntimeClient.ts`
- Modify: `tauri-app/src/components/agents/AgentsView.tsx`

**Interfaces:**
- Produces commands: `list_agent_profiles`, `create_agent_profile`, `list_agent_runs`, `read_agent_run`.
- Produces desktop methods under `window.scriptManagerDesktop.agents` only when implemented: `discover`, `run`, `interruptRun`, `resumeRun`, `terminateRun`, `onEvent`.

- [ ] **Step 1: Feature-gate provider process control**

Until real ACP provider execution is ported, `AgentsView` must show migrated history/profile state plus a clear provider-execution pending state.

- [ ] **Step 2: Implement profile/run history persistence**

Keep commands useful for display and future execution.

- [ ] **Step 3: Port provider discovery**

Allow only configured provider executable names. Do not allow arbitrary renderer-supplied commands.

- [ ] **Step 4: Verify**

Manual smoke: Agents tab opens, profile create works, unavailable provider execution does not crash.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/agents.rs tauri-app/src/lib/agentRuntimeClient.ts tauri-app/src/components/agents/AgentsView.tsx
git commit -m "feat(tauri): migrate agent profiles and gate provider execution"
```

---

### Task 15: Plugins Marketplace And Host Boundary

**Files:**
- Create: `tauri-app/src-tauri/src/plugins.rs`
- Modify: `tauri-app/src-tauri/src/lib.rs`
- Modify: `tauri-app/src/lib/pluginsRuntimeClient.ts`
- Modify: `tauri-app/src/components/settings/PluginsSection.tsx` or plugin-related settings components

**Interfaces:**
- Produces commands: `list_plugins`, `update_plugin`, `remove_plugin`.

- [ ] **Step 1: Write plugin manifest read tests**

Test local plugin manifest parse, invalid manifest rejection, disabled plugin state.

- [ ] **Step 2: Implement list/update/remove**

Keep execution host disabled until capability/RBAC/secret boundaries are ported.

- [ ] **Step 3: Render pending execution status**

Marketplace/settings UI should open and manage local metadata without claiming node execution is ready.

- [ ] **Step 4: Verify**

Manual smoke: plugin settings opens, invalid plugin shows error, enable/disable metadata changes survive refresh.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src-tauri/src/plugins.rs tauri-app/src/lib/pluginsRuntimeClient.ts tauri-app/src/components/settings
git commit -m "feat(tauri): migrate plugin management shell"
```

---

### Task 16: Remove Or Quarantine Next/Web Runtime Leftovers

**Files:**
- Modify/delete: `tauri-app/src/app/api/**`
- Modify: any renderer file still importing `NextResponse`, `NextRequest`, `next/navigation`, or direct desktop `/api/*` fallbacks.
- Modify: `tauri-app/vite.config.ts`

**Interfaces:**
- Produces: Vite renderer bundle with no accidental Next route dependencies.

- [ ] **Step 1: Inventory leftovers**

Run:

```powershell
rg -n "NextResponse|NextRequest|from 'next/|from \"next/|/api/" tauri-app/src --glob "!app/api/**"
```

Expected: only intentional web-mode code remains.

- [ ] **Step 2: Move reference routes**

If still useful, move `tauri-app/src/app/api/**` to `docs/reference/next-api-routes/` or delete after confirming Git history preserves them.

- [ ] **Step 3: Add guard against direct desktop API fallback**

Add a script or CI check that fails when runtime clients add desktop `/api/*` fallback without an explicit `isWebMode` predicate.

- [ ] **Step 4: Verify**

Run TypeScript and Vite build. Start Tauri dev and switch all tabs.

- [ ] **Step 5: Commit**

```powershell
git add tauri-app/src tauri-app/vite.config.ts docs/reference
git commit -m "chore(tauri): quarantine web route leftovers"
```

---

### Task 17: Full Manual Smoke And Handoff Update

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-02-tauri-rewrite.md`
- Modify: `docs/superpowers/plans/2026-09-02-tauri-crash-free-migration.md`
- Create: `docs/releases/tauri-smoke-2026-09-02.md`

**Interfaces:**
- Produces: durable evidence document with pass/fail status per product surface.

- [ ] **Step 1: Run automated verification**

```powershell
cd tauri-app
npx tsc --noEmit
npm run build
cd src-tauri
cargo test
```

- [ ] **Step 2: Run visible Tauri dev smoke**

```powershell
cd tauri-app
npx tauri dev
```

Smoke surfaces:

- Startup and idle.
- Scripts CRUD and execution.
- Collections/tags/templates.
- Terminal open/input/resize/close.
- API client CRUD/send/history.
- Workflows save/publish/run/retry/cancel.
- Observability dashboard.
- Settings, secrets, Gist, workspace access.
- Approvals and notifications.
- Git/source control.
- Ops and remote execution.
- Storage providers.
- Agents.
- Plugins.

- [ ] **Step 3: Record exact evidence**

For each surface, write `passed`, `blocked`, or `migration-pending`, plus command output and screenshots if available.

- [ ] **Step 4: Update handoff**

Update the Tauri handoff with current branch, latest commit, verification, blockers, and next surface to migrate.

- [ ] **Step 5: Commit**

```powershell
git add docs/releases/tauri-smoke-2026-09-02.md docs/superpowers/handoffs/2026-09-02-tauri-rewrite.md docs/superpowers/plans/2026-09-02-tauri-crash-free-migration.md
git commit -m "docs(tauri): record full migration smoke evidence"
```

---

## Execution Notes For The Next Agent

- Start from `feat/tauri-rewrite`.
- Read `docs/superpowers/handoffs/2026-09-02-tauri-rewrite.md` first.
- Read this plan second.
- Do not run `npm run tauri:build` unless the user asks for packaging or all dev-mode smoke gates are stable.
- Keep commits small by task. If a task becomes too large, split by domain but keep each split independently testable.
- If a tab crashes, reproduce with `npx tauri dev`, capture console/Rust logs, write the smallest failing test or smoke note, and fix the source contract rather than adding fallback data.

## Self-Review

- Spec coverage: covers startup, scripts, terminal, API client, workflows, observability, settings, secrets, approvals, notifications, Git, ops, storage, agents, plugins, web leftovers, verification, and handoff.
- Placeholder scan: no `TBD` or generic "handle edge cases" tasks remain; each task has files, interfaces, steps, verification, and commit boundary.
- Type consistency: runtime method names use existing camelCase renderer convention; Rust commands use snake_case Tauri convention.
