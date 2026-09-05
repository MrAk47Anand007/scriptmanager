# ScriptManager Tauri Rewrite Handoff — Updated 2026-09-05

## Branch Truth

- Repository: `scriptmanager`
- Branch: `feat/tauri-rewrite`
- Remote tracking branch: `origin/feat/tauri-rewrite`
- Migration status: **feature-complete for the planned milestone** (see `docs/superpowers/plans/2026-09-05-tauri-migration-completion-plan.md` and `docs/releases/tauri-smoke-2026-09-05.md`).

## Migration Progress (all slices committed)

Completed since the 2026-09-02 handoff:

- Tasks 1–4 from the master plan (runtime contract, schema bootstrap, CRUD parity, execution/env/versions/builds).
- S1: legacy Next.js server runtime quarantined out of `tauri-app/src` (removed from repo, preserved in git history); terminal lifecycle verified against the S1.3 contract.
- S2: settings write, gist credentials (token never leaves Rust in reads), script export/import (`settings.rs`).
- S3: secrets vault with AES-256-GCM at-rest encryption, access events, reveal-once, Rust-side resolution (`security.rs`; master key file in app data — decision S3.1).
- S4: script schedules (5-field cron, tokio tick loop, run-once missed-run policy) + GitHub Gist sync via `reqwest` (`scheduler.rs`, `gist.rs`; `run_script_core` refactor with `triggered_by`).
- S5: observability dashboard (aggregation over builds/workflow runs/API collection runs, failure trend, schedule health, cancel/retry) (`observability.rs`).
- S6: approvals (immutable decisions) + notifications (channels/rules/deliveries + `notification-event` dispatch) (`approvals.rs`, `notifications.rs`).
- S7: ops server profiles, TCP connection test, remote-exec approval state machine, audit log (`remote_exec.rs`). **SSH transport stays typed migration-pending** (decision S7.2 — no shell string interpolation ported).
- S8: storage providers — local filesystem provider fully migrated (test + push-sync), credential masking, other kinds typed pending (`storage.rs`).
- S9: agent profiles/run history/discovery (allowlist-only) + plugin management shell; provider execution and plugin host deliberately gated (`agents.rs`, `plugins.rs`).
- W1: local-owner workspace model (RBAC retired per decision D1) + `npm run guard:no-api-fallback` guard against desktop `/api` fallbacks (`workspace_access.rs`, `scripts/check-no-desktop-api-fallback.mjs`).
- W2: smoke evidence recorded in `docs/releases/tauri-smoke-2026-09-05.md`.

## Verification At Handoff

- `npx tsc --noEmit` — clean.
- `cargo test` — 92 passed / 0 failed.
- `npm run build` — passes.
- `npm run guard:no-api-fallback` — OK.
- `npm run tauri:build:no-bundle` — release exe built.
- Release exe process-start smoke — alive after 10s, stopped deliberately.

## Remaining (explicitly out of the completed milestone)

1. Visible interactive tab click-through in `npx tauri dev` (human/UI-automation step).
2. Live Gist sync with a real GitHub token.
3. SSH transport (russh) for remote exec/SCP.
4. Agent ACP provider execution; plugin execution host.
5. OS-native notifications (Tauri-event delivery works).
6. Installer packaging (`npm run tauri:build`) — run on request now that dev-mode gates pass.

## Files To Read First Next Session

- `docs/releases/tauri-smoke-2026-09-05.md`
- `docs/superpowers/plans/2026-09-05-tauri-migration-completion-plan.md`
- `tauri-app/src-tauri/src/lib.rs` (full command registry)
- `tauri-app/src/lib/desktopCapabilities.ts` (capability truth)
- `tauri-app/src/main.tsx` (explicit bridge)
