# Tauri Migration Verification - 2026-09-12

## Source And Build Evidence

- `npx tsc --noEmit` passed.
- `npm run guard:no-api-fallback` passed.
- `npm run guard:desktop-bridge` passed.
- `npm run build` passed. Vite reported the existing large chunk warning for `index--d6mMYz4.js`.
- `cargo test --lib -- --nocapture` passed: 120 tests, 0 failed.
- `npm run tauri:build:no-bundle` passed and built `tauri-app/src-tauri/target/release/scriptmanager.exe`.

## Tauri Dev Startup Evidence

- `npx tauri dev` started Vite on `http://localhost:1420`.
- Tauri compiled and launched `target/debug/scriptmanager.exe`.
- Startup logs showed schema creation/migration and initial native command reads for scripts, tags, collections, templates, and notification deliveries.
- No missing Tauri command errors appeared in the captured startup logs.
- The dev process was stopped cleanly with Ctrl+C after startup evidence was captured.

## Source Work Completed In This Migration Pass

- Removed renderer reliance on `window.__ELECTRON__` and replaced desktop shell detection with Tauri-oriented bridge/capability checks.
- Added a desktop bridge contract guard and exposed missing top-level helpers for reveal path, clipboard, notifications, Python workspace inspection, webhook controls, canonical recovery, agent events, agent termination, and Git approval-pending display.
- Implemented native linked-folder open/rescan/canonical recovery and Python `.venv` workspace management.
- Added native API auth preparation for bearer, basic, API key, and manual OAuth2 token shapes, plus explicit pre-request/test-script migration-pending history records.
- Clarified local-only cloud storage support and disabled unsupported provider claims.
- Preserved plugin registry metadata while explicitly disabling plugin execution host claims.
- Documented the remote execution SSH/SFTP target architecture: `russh` plus `russh-sftp`.
- Added native protected-Git approval integration: protected Git actions create/reuse approval requests, block while pending, honor rejected decisions, and proceed after an approved matching request.
- Updated operator/troubleshooting/docs language from Electron-hosted assumptions to Tauri-hosted behavior.

## Remaining Manual Or External Verification

- Full visual Tauri smoke is still pending: open each activity tab; exercise Scripts create/edit/run/cancel and terminal input; API send/history; Workflow create/publish/run/cancel/retry; Git status/log/commit-safe flow; Settings sections; and visible pending surfaces.
- Gist live sync/delete still needs a real GitHub token.
- API live send with bearer/basic/API key/no-auth still needs a local or live HTTP smoke target from the Tauri UI; source preparation is covered by Rust tests.
- Remote SSH/SFTP transport remains a deliberate migration-pending runtime. Current code supports profiles, TCP reachability checks, approval/audit records, and typed pending transfer/execution errors.
- ACP provider execution remains migration-pending. Profiles/history/discovery are native; run/interrupt/resume/terminate return typed pending errors until process control is ported.
- Workflow notification/remote/agent/plugin nodes remain pending behind clear persisted failure states until their underlying native dispatcher, SSH, ACP, and plugin-host runtimes exist.
- Protected Git approval consumption is source-complete for matching protected Git action requests; full visual workbench retry smoke remains pending with the broader Tauri UI smoke pass.

## Known Non-Blocking Warnings

- Rust emits existing unused import/unused variable/dead code warnings in modules including `scan.rs`, `security.rs`, `execution.rs`, `approvals.rs`, `notifications.rs`, `observability.rs`, `plugins.rs`, and `remote_exec.rs`.
- Vite emits an existing large-chunk warning after production build.
