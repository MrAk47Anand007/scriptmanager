# Tauri Migration Smoke Evidence — 2026-09-05

Branch: `feat/tauri-rewrite`
Verification ladder: `npx tsc --noEmit` (clean), `cargo test` (92 passed / 0 failed), `npm run build` (passes), `npm run guard:no-api-fallback` (OK), `npm run tauri:build:no-bundle` (release exe built), release exe process-start smoke (alive after 10s, stopped deliberately).

## Visible `npx tauri dev` tab click-through (UI automation, 2026-09-05)

Every activity tab was opened by UI automation on the live dev app; screenshots confirmed each surface renders, and the dev log was scanned afterwards for missing-command errors (none found).

| Surface | Status | Notes |
|---|---|---|
| Scripts workspace | **passed** | Created "Smoke Test Script" via dialog; Monaco editor loaded; side panels (webhook/schedule/timeout/parameters/tags/env/version history) render; Run executed Python and "Hello World" streamed to terminal pane; script persisted across app restart |
| Terminal dock (scripts activity) | **passed** | Bottom-dock terminal started a live PowerShell PTY; typed input echoed and executed (`CommandNotFoundException` for a garbled smoke command proves full PTY round-trip); prompt returned |
| API workspace | **passed** (after fix, see below) | Collections/environments/globals sidebar + request-editor panes render; empty states correct |
| Workflows | **passed** | Workflow builder, template list, node config panel render |
| AI Agents | **passed** | PATH discovery ran (Codex/Claude "not found" badges), configured profiles + recent runs lists render |
| Git / Source control | **passed** | Repository workspace, project selector, diff/history, fetch/pull/push toolbar render |
| Executions (observability) | **passed** | Metric cards, recent runs, schedule health, failure trend render with live aggregation queries |
| Approvals | **passed** | Approval inbox renders empty pending view via `list_approvals` |
| Ops console | **passed** (after fix, see below) | Servers/projects panels, Execute/Servers/Audit tabs, summary cards; audit count correct |
| Schedules | **passed** | "No schedules yet — set a cron on any script" empty state via `read_schedule` path |
| Settings | **passed** | General (workspace root/timeout/save), Import & Export, and all migrated sections listed (Appearance, Cloud Storage, GitHub Gist, Security, Secret Vault, Notifications, Plugins, Workspace Access, Desktop) |
| Crash / missing-command scan | **passed** | No tab crashes (MigrationBoundary contained two pre-fix errors); dev log contains zero "no such command"/missing-command entries |

## Bugs found by the visible smoke and fixed during it

1. **API workspace crashed with "Cannot read properties of null (reading 'useRef')"** — `react-resizable-panels` resolved from the repo-root `node_modules` (React 19.2.4) instead of `tauri-app`'s React 19.2.8. Fixed by declaring the dependency in `tauri-app/package.json` and adding `resolve.dedupe: ['react', 'react-dom']` in `vite.config.ts`.
2. **Scripts editor failed with "Lazy element type must resolve to a class or function"** — `@monaco-editor/react`'s default export is a `memo()` object; `src/lib/dynamic.tsx` now normalizes interop/`.default` chains and accepts memo/forwardRef component types before handing to `React.lazy`.
3. **"parameters.map is not a function"** — Rust returns `scripts.parameters` as a JSON string; `ScriptsManager` now normalizes string-or-array via `normalizeScriptParameters`.
4. **Ops "Audit entries: undefined"** — `list_audit_log` now returns the `{ total, executions: [...] }` shape the ops slice expects, with remote-execution status mapping (`pending` → `pending_approval`).

All fixes re-verified live in the dev app; full ladder re-run after fixes (92 Rust tests, tsc, build, guard — all green).

## Per-surface status from automated evidence (2026-09-05, earlier)

| Surface | Status | Evidence |
|---|---|---|
| Startup / SQLite schema bootstrap | passed | `ensure_schema_creates_startup_tables` + startup reads; release exe process smoke |
| Scripts CRUD, collections, tags, templates | passed | `task3_crud_smoke_matches_visible_flow` and related Rust tests |
| Script env vars / versions / builds | passed | Rust command tests; secret masking covered |
| Script execution (run/cancel/build events) | passed | execution.rs lifecycle tests + visible smoke |
| Terminal lifecycle | passed | terminal state/event tests + visible PTY smoke |
| Secrets vault | passed | security.rs create/rotate/disable/reveal/access-event tests; AES-256-GCM at rest |
| Schedules | passed | scheduler.rs cron tests + schedule CRUD; background tick shares `run_script_core` |
| Gist sync | passed (logic) | gist.rs token-gating + link persistence; live GitHub API sync needs a token — manual smoke pending |
| Observability dashboard | passed | observability.rs aggregation/filters/schedule-health/log tests |
| Approvals | passed | approvals.rs decide-once/immutability tests |
| Notifications | passed | notifications.rs channel/rule/delivery + dispatch matching tests; OS-native delivery pending |
| Ops: SSH transport (exec/SCP) | migration-pending | typed errors; russh integration is a dedicated future slice (plan S7.2 decision) |
| Storage providers | passed | storage.rs masking + local test/push-sync tests; S3/GCS/WebDAV typed pending; GDrive/OneDrive OAuth pending |
| Agents: provider execution | migration-pending | typed errors; ACP process control is a future slice |
| Plugins: execution host | migration-pending | disabled by design until capability boundaries are ported |
| Workspace access | passed (local-owner) | workspace_access.rs local-owner model test; collaboration retired per decision D1 |
| Web leftovers | passed | quarantine + `guard:no-api-fallback` npm guard |

## Pending (not blockers for the code migration)

1. **Live Gist sync** against api.github.com with a real token.
2. **SSH transport** for remote execution/SCP (russh slice).
3. **Agent ACP provider execution** and **plugin execution host** (deliberately gated).
4. **OS-native notifications** (currently Tauri events only).
