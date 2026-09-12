# Tauri Migration Verification - 2026-09-12

## Source And Build Evidence

- `npx tsc --noEmit` passed.
- `npm run guard:no-api-fallback` passed.
- `npm run guard:desktop-bridge` passed.
- `npm run build` passed. Vite reported the existing large chunk warning for `index--d6mMYz4.js`.
- `cargo test --lib -- --nocapture` passed: 129 tests, 0 failed.
- `npm run tauri:build:no-bundle` passed and built `tauri-app/src-tauri/target/release/scriptmanager.exe`.

## Tauri Dev Startup Evidence

- `npx tauri dev` started Vite on `http://localhost:1420`.
- Tauri compiled and launched `target/debug/scriptmanager.exe`.
- Startup logs showed schema creation/migration and initial native command reads for scripts, tags, collections, templates, and notification deliveries.
- No missing Tauri command errors appeared in the captured startup logs.
- The dev process was stopped cleanly with Ctrl+C after startup evidence was captured.
- A later `npx tauri dev` run opened the visible `ScriptManager` desktop window through Windows UI Automation. The app reached `Desktop / Ready`, every activity tab opened without crashing, and all Settings subsections rendered and stayed Ready.

## Source Work Completed In This Migration Pass

- Removed renderer reliance on `window.__ELECTRON__` and replaced desktop shell detection with Tauri-oriented bridge/capability checks.
- Added a desktop bridge contract guard and exposed missing top-level helpers for reveal path, clipboard, notifications, Python workspace inspection, webhook controls, canonical recovery, agent events, agent termination, and Git approval-pending display.
- Implemented native linked-folder open/rescan/canonical recovery and Python `.venv` workspace management.
- Added native API auth preparation for bearer, basic, API key, and manual OAuth2 token shapes, plus explicit pre-request/test-script migration-pending history records.
- Added loopback API execution proof for no-auth, bearer, basic, and API-key query requests through the native request path.
- Added real native `portable-pty` smoke proof for terminal create, command input, output read, resize, close, and restart.
- Added remote execution approval-contract proof: start returns renderer-compatible approval metadata, approve/reject remains immutable, and connection tests expose both legacy and renderer field names.
- Added native workflow notification-node execution with persisted notification delivery evidence for channel kind and channel id paths.
- Added durable migration-pending agent launch records: failed run, user/system messages, and a final `agent-event` refresh signal when ACP process control is unavailable.
- Added durable migration-pending agent control records: interrupt/resume/terminate attempts validate the run id, append system messages, and resume also persists the follow-up prompt while real provider process control remains unavailable.
- Clarified local-only cloud storage support and disabled unsupported provider claims.
- Preserved plugin registry metadata while explicitly disabling plugin execution host claims.
- Documented the remote execution SSH/SFTP target architecture: `russh` plus `russh-sftp`.
- Added native protected-Git approval integration: protected Git actions create/reuse approval requests, block while pending, honor rejected decisions, and proceed after an approved matching request.
- Added native Git dispatcher verification for status, log, branches, diff, add/stage, reset/unstage, commit, push, fetch, and pull using a temporary local repo and bare origin.
- Added visible and source-level proof for Tauri open-folder restart behavior: the dialog opens after restart, accepts the renderer camelCase `folderPath` payload, and linked-folder scripts read/save/run against their canonical source files with containment checks.
- Added API send/history UI proof in the visible Tauri window and refreshed Redux history state immediately after successful native sends so newly inserted native history records appear in the API sidebar.
- Updated operator/troubleshooting/docs language from Electron-hosted assumptions to Tauri-hosted behavior.

## Remaining Manual Or External Verification

- Visual Tauri smoke is partially complete: the desktop window opens, all activity tabs navigate, all Settings sections render, visible pending surfaces such as Plugins and Workspace Access do not crash, the Scripts open-folder dialog opens after restart, and the API Client can send a GET request to a disposable local HTTP endpoint, render a `200 OK` JSON response, and show recent entries in History. Scripts create/edit/run/cancel, Workflow create/publish/run/cancel/retry, and Git UI status/log/commit-safe flow still need hands-on UI proof. Terminal panel opens, but terminal text entry was not automated because Windows UI automation safety rules forbid terminal interaction through UI automation.
- Gist live sync/delete still needs a real GitHub token.
- API live send with bearer/basic/API key/no-auth is source-verified against a loopback HTTP server; visual Tauri UI API smoke is verified for a GET request and History refresh against `http://127.0.0.1:17891/smoke?from=tauri`.
- Remote SSH/SFTP transport remains a deliberate migration-pending runtime. Current code supports profiles, SSH identification-banner connection checks, renderer-compatible approval/audit records, and typed pending transfer/execution errors.
- ACP provider process control remains migration-pending. Profiles/history/discovery are native; launch and control attempts now persist migration-pending run history/messages until real provider process launch and control are ported.
- Workflow remote/agent/plugin nodes remain pending behind clear persisted failure states until their underlying SSH, ACP, and plugin-host runtimes exist. Notification nodes now execute through native persisted deliveries.
- Protected Git approval consumption is source-complete for matching protected Git action requests; full visual workbench retry smoke remains pending with the broader Tauri UI smoke pass.

## Known Non-Blocking Warnings

- Rust emits existing unused import/unused variable/dead code warnings in modules including `scan.rs`, `security.rs`, `execution.rs`, `approvals.rs`, `notifications.rs`, `observability.rs`, `plugins.rs`, and `remote_exec.rs`.
- Vite emits an existing large-chunk warning after production build.
