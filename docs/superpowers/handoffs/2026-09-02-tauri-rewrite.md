# ScriptManager Tauri Rewrite Handoff - 2026-09-02

## Branch Truth

- Repository: `scriptmanager`
- Branch: `feat/tauri-rewrite`
- Remote tracking branch: `origin/feat/tauri-rewrite`
- Current head before this handoff update: `0b38e87` (`build(tauri): production release build with embedded frontend assets`)
- Working tree at pickup: clean.

This branch is a direct Tauri rewrite effort, not a continuation of the earlier Electron dual-mode foundation plan. The older Electron/Phase 10 handoffs remain useful for product requirements and validation history, but the current source of truth is `tauri-app/`.

## Completed Tauri Migration Work

Recent branch commits show the following completed slices:

- Initialized a Tauri 2 + Vite + React workspace under `tauri-app/`.
- Migrated the former Next.js renderer components into the Vite app and replaced Next-specific imports where required.
- Added a Rust SQLite connection pool and initial script/collection/settings model surface.
- Wired UI runtime clients to Tauri `invoke` commands through a compatibility IPC layer.
- Added Rust integrations for native PTY terminal sessions, file watching, Git operations, API execution, JavaScript sandbox execution, and workflow DAG execution.
- Removed old Electron and Next.js frontend code from the active Tauri path.
- Fixed React runtime crashes caused by dynamic imports, icon usage, IPC compatibility, and effect cleanup promises.
- Fixed Tauri window startup so the main window is centered, visible, focused, and shown explicitly.
- Verified Vite production assets can be built and embedded for Tauri release packaging.

## Verification Evidence At Pickup

Fresh checks run from this branch:

```powershell
cd tauri-app
npm run build
```

Result: passed. Vite built the production frontend assets successfully. It emitted only chunk-size and plugin-timing warnings.

```powershell
cd tauri-app/src-tauri
cargo test
```

Result: passed. Rust compiled and ran 0 unit/doc tests successfully. Before cleanup, it emitted six non-failing unused-code warnings in `db.rs`, `models.rs`, and `terminal.rs`.

## Cleanup Applied In This Handoff Pass

- Removed unused Rust imports from `tauri-app/src-tauri/src/db.rs`.
- Removed unused Rust imports from `tauri-app/src-tauri/src/models.rs`.
- Removed unused Rust imports from `tauri-app/src-tauri/src/terminal.rs`.
- Marked `DesktopSettings` as an intentionally retained DTO while it is not yet constructed by the Rust command surface.
- Renamed the Rust package/library metadata from the default `app`/`app_lib` names to `scriptmanager`/`scriptmanager_lib`.
- Replaced the forbidden default Tauri bundle identifier `com.tauri.dev` with `com.scriptmanager.desktop`.
- Narrowed local Windows bundling to `nsis` so the build no longer attempts the WiX MSI path by default.
- Enabled `bundle.useLocalToolsDir` so Tauri caches NSIS/WiX helper tools under `tauri-app/src-tauri/target/.tauri/` instead of relying on a global user cache.
- Added `tauri:build` and `tauri:build:no-bundle` npm scripts in `tauri-app/package.json`.

## Fresh Verification After This Handoff Pass

```powershell
cd tauri-app
npm run build
```

Result: passed. Vite production assets built successfully; only chunk-size and plugin-timing warnings remained.

```powershell
cd tauri-app/src-tauri
cargo test
```

Result: passed. Rust compiled under the renamed `scriptmanager` package and ran 0 unit/doc tests successfully with no unused-code warnings.

```powershell
cd tauri-app
npm run tauri:build:no-bundle
```

Result: passed. Tauri built the release application binary at `tauri-app/src-tauri/target/release/scriptmanager.exe`.

```powershell
cd tauri-app
npm run tauri:build
```

Result: passed after enabling `bundle.useLocalToolsDir`. Tauri downloaded and cached the NSIS tooling locally, built the release binary, and produced the installer at `tauri-app/src-tauri/target/release/bundle/nsis/scriptmanager_0.1.0_x64-setup.exe`.

Generated artifacts:

- Release executable: `tauri-app/src-tauri/target/release/scriptmanager.exe` (26,510,848 bytes).
- NSIS setup executable: `tauri-app/src-tauri/target/release/bundle/nsis/scriptmanager_0.1.0_x64-setup.exe` (6,792,267 bytes).

```powershell
Start-Process tauri-app/src-tauri/target/release/scriptmanager.exe
```

Result: process-start smoke passed. The release executable started and remained alive after 8 seconds. The process was then stopped deliberately. This is startup-process evidence only; it is not a visual or interactive UI-flow validation.

## Current Completion Status

- Tauri frontend build complete: yes.
- Rust command compilation complete: yes.
- Rust automated tests complete: only compile/doc-test smoke exists today; no behavior tests yet.
- Tauri release binary build complete: yes, via `npx tauri build --no-bundle`.
- Full installer bundle build complete: yes, via `npm run tauri:build`.
- Release executable process-start smoke complete: yes.
- Manual Tauri visual and core-flow UI smoke after the latest release-build changes: pending.
- Feature parity against the Electron/Next product: partial. The renderer and many clients are migrated, but branch-local parity proof is not yet recorded.

## Crash-Free Migration Update

The user clarified that the migration started recently and the priority is now crash-free path migration, not final executable packaging. Treat installer proof as secondary until the app is stable in dev and visible smoke.

Root cause reproduced in `npx tauri dev`: the renderer startup called Electron-style runtime methods that Rust did not implement:

- `get_bootstrap_state`
- `list_templates`
- `list_tags`
- `on_canonical_folder_change`
- `on_build_event`

The first three were missing Rust commands. The event failures came from the old catch-all runtime Proxy, which made every runtime property look available and tried to invoke event subscription methods as Tauri commands.

First stability slice applied:

- Replaced the catch-all runtime Proxy in `tauri-app/src/main.tsx` with an explicit Tauri bridge.
- Added `get_bootstrap_state`, `list_tags`, and `list_templates` Rust commands.
- Added focused Rust tests for empty startup bootstrap/catalog behavior.
- Re-ran `npx tauri dev`; startup no longer printed those command-not-found failures during the idle check.
- Verified without final packaging: `npx tsc --noEmit`, `cargo test`, and `npm run build` all pass.

Task 1 from the full migration plan is now applied:

- Added `tauri-app/src/lib/desktopCapabilities.ts` as the central Tauri capability map.
- Added `tauri-app/src/lib/unsupportedTauriFeature.ts` and `tauri-app/src/lib/tauriInvoke.ts` for typed unsupported-feature errors and normalized command failures.
- Added `tauri-app/src/components/MigrationBoundary.tsx` and wrapped activity panels in `tauri-app/src/app/page.tsx`.
- Gated currently unmigrated activity surfaces so they render stable migration-pending states instead of lazy-loading old `/api/*` or Electron-dependent paths.
- Updated the bridge in `tauri-app/src/main.tsx` to expose capabilities and use normalized Tauri invokes while keeping bridge-phase `__ELECTRON__` compatibility for existing desktop checks.
- Verified without final packaging: `npx tsc --noEmit`, `npm run build`, `cargo test`, and `npx tauri dev` startup smoke all pass. Full visible tab-click smoke remains pending for Task 17.

Task 2 from the full migration plan is now applied:

- Added `tauri-app/src-tauri/src/error.rs` for shared `AppError` and `AppResult<T>`.
- Added `tauri-app/src-tauri/src/state.rs` for Tauri app data path resolution and local `scriptmanager.db`, `scripts`, and `builds` directories.
- Added `tauri-app/src-tauri/src/schema.rs` with `ensure_schema` and a focused startup-table test.
- Updated `tauri-app/src-tauri/src/db.rs` so startup creates directories, opens the local SQLite database, and bootstraps the minimum schema before commands query it.
- Verified without final packaging: focused schema test, full `cargo test`, `npx tsc --noEmit`, `npm run build`, and `npx tauri dev` startup smoke all pass.
- `npx tauri dev` logs showed schema creation with `CREATE TABLE IF NOT EXISTS` and successful reads for scripts, collections, templates, and tags.

Task 3 core parity is now partially applied:

- Added Rust tests for script CRUD, collection CRUD/delete/move, tags, and templates.
- Added Rust command coverage for script read/save/delete/duplicate, collection create/update/delete/move, tag add/remove, and template save/delete.
- Registered the new commands in `tauri-app/src-tauri/src/lib.rs` and exposed them through the explicit Tauri bridge in `tauri-app/src/main.tsx`.
- Expanded Rust DTOs so scripts, collections, and templates return the richer fields expected by the renderer.
- Added Tauri-local `scripts.content` schema support and an `ALTER TABLE` guard for existing dev databases.
- Updated `tauri-app/src/lib/scriptsRuntimeClient.ts` so desktop script and collection list calls go through the explicit bridge. Gist and schedule methods now throw typed `UnsupportedTauriFeatureError` while those surfaces wait for later tasks.
- Verification passed: `cargo test commands::tests -- --nocapture`, full `cargo test`, `npx tsc --noEmit`, `npm run build`, and `npx tauri dev` startup smoke.
- Fixed the Tauri bridge payload shape for payload-style commands, so `create_script`, `save_script`, collection CRUD, move, tags, and template save receive `{ payload }` as Rust expects.
- Added `task3_crud_smoke_matches_visible_flow`, covering create script, rename/update script, create collection, move script, tag script, create/delete template, and refresh data.
- Native visible click-through is still recommended when UI control is available, but Task 3 Step 5 has automated command-level smoke coverage in this environment.

Detailed plans:

- `docs/superpowers/plans/2026-09-02-tauri-crash-free-migration.md` - root-cause summary and stability rules.
- `docs/superpowers/plans/2026-09-02-tauri-full-migration-master-plan.md` - full transferable task-by-task migration plan for all product surfaces.

## Recommended Next Steps

1. Continue with Task 4: script env, versions, builds, and execution events.
2. When native UI automation or a human tester is available, still perform visible click-through for the Task 3 CRUD flow as a UX confirmation.
2. Add terminal lifecycle correctness: stable events, close behavior, and child-process cleanup.
3. Migrate API client storage/execution after scripts and terminal are stable.
4. Keep final exe/installer work paused until visible Tauri dev smoke is consistently crash-free.

## Files To Read First Next Session

- `tauri-app/package.json`
- `tauri-app/src/main.tsx`
- `tauri-app/src/lib/scriptsRuntimeClient.ts`
- `tauri-app/src/lib/settingsRuntimeClient.ts`
- `tauri-app/src-tauri/src/lib.rs`
- `tauri-app/src-tauri/src/commands.rs`
- `tauri-app/src-tauri/src/db.rs`
- `tauri-app/src-tauri/src/terminal.rs`
- `tauri-app/src-tauri/src/git_ops.rs`
- `tauri-app/src-tauri/src/fs_ops.rs`
- `tauri-app/src-tauri/src/execution.rs`
- `tauri-app/src-tauri/tauri.conf.json`
