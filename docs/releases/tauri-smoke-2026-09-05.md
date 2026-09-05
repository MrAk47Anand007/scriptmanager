# Tauri Migration Smoke Evidence — 2026-09-05

Branch: `feat/tauri-rewrite`
Verification ladder: `npx tsc --noEmit` (clean), `cargo test` (92 passed / 0 failed), `npm run build` (passes), `npm run guard:no-api-fallback` (OK), `npm run tauri:build:no-bundle` (release exe built), release exe process-start smoke (alive after 10s, stopped deliberately).

## Per-surface status

| Surface | Status | Evidence |
|---|---|---|
| Startup / SQLite schema bootstrap | passed | `ensure_schema_creates_startup_tables` + startup reads; release exe process smoke |
| Scripts CRUD, collections, tags, templates | passed (Task 3 + 4 tests) | `task3_crud_smoke_matches_visible_flow` and related Rust tests |
| Script env vars / versions / builds | passed | Rust command tests; secret masking covered |
| Script execution (run/cancel/build events) | passed | execution.rs lifecycle tests + release smoke |
| Terminal lifecycle | passed (tests) | terminal state/event/interpreter tests; visible echo/resize/close smoke recommended |
| Settings read/write, gist credentials, export/import | passed | settings.rs round-trip + masking tests |
| Secrets vault | passed | security.rs create/rotate/disable/reveal/access-event tests; AES-256-GCM at rest |
| Schedules | passed | scheduler.rs cron parse tests + schedule CRUD; background tick shares `run_script_core` |
| Gist sync | passed (logic) | gist.rs token-gating + link persistence; live GitHub API sync needs a token — manual smoke pending |
| Observability dashboard | passed | observability.rs aggregation/filters/schedule-health/log tests |
| Approvals | passed | approvals.rs decide-once/immutability tests |
| Notifications | passed | notifications.rs channel/rule/delivery + dispatch matching tests; OS-native delivery pending |
| Ops: server profiles, remote-exec approval flow, audit | passed | remote_exec.rs CRUD/state-machine/audit tests |
| Ops: SSH transport (exec/SCP) | migration-pending | typed errors; russh integration is a dedicated future slice (plan S7.2 decision) |
| Storage providers | passed | storage.rs masking + local test/push-sync tests; S3/GCS/WebDAV typed pending; GDrive/OneDrive OAuth pending |
| Agents: profiles/run history/discovery | passed | agents.rs tests; discovery allowlist-only |
| Agents: provider execution | migration-pending | typed errors; ACP process control is a future slice |
| Plugins: manifest/management shell | passed | plugins.rs manifest parse + lifecycle tests; execution host disabled by design |
| Workspace access | passed (local-owner) | workspace_access.rs local-owner model test; collaboration retired per decision D1 |
| Web leftovers | passed | quarantine + `guard:no-api-fallback` npm guard |

## Pending (not blockers for the code migration)

1. **Visible interactive click-through** of every tab in `npx tauri dev` (needs a human or UI automation; all command-level smokes pass).
2. **Live Gist sync** against api.github.com with a real token.
3. **SSH transport** for remote execution/SCP (russh slice).
4. **Agent ACP provider execution** and **plugin execution host** (deliberately gated).
5. **OS-native notifications** (currently Tauri events only).
