# Tauri Migration Verification - 2026-09-12

## Source And Build Evidence (Evening Pass)

- `npx tsc --noEmit` passed.
- `npm run guard:no-api-fallback` passed.
- `npm run guard:desktop-bridge` passed.
- `npm run build` passed.
- `cargo test` passed: 149 lib tests, 0 failed (up from 140 at the start of this pass).
- `npm run tauri:build:no-bundle` passed and built `tauri-app/src-tauri/target/release/scriptmanager.exe`.

## Features Completed In The Evening Pass

### SSH/SFTP remote execution transport (russh + russh-sftp)

- New `ssh_transport.rs`: SSH connect with host-key pinning (SHA-256 fingerprints stored per profile, trust-on-first-use, hard rejection on mismatch), password and key-file auth, command execution with streamed stdout/stderr line callbacks, SFTP upload/download, absolute-path validation.
- Profile secrets are now encrypted at rest (`server_profiles.encrypted_secret`, AES-256-GCM via the vault master key) and decrypted only at connection time; the renderer `secret` field is no longer silently dropped.
- Connection tests perform a full authenticated SSH handshake when credentials exist and report `authenticated` plus the pinned `hostKeyFingerprint`.
- Approved remote executions stream real output through `remote-exec-event` line/done/error events and persist output, exit code, and audit rows (exit 255 for transport failures).
- `transfer_remote_script` uploads script content over SFTP with optional octal permissions via SETSTAT.
- Integration tests run against a disposable in-process russh SSH/SFTP server (`ssh_test_server.rs`) with password auth, canned exec behavior, and an in-memory SFTP filesystem.
- Workflow remote nodes execute over SSH/SFTP: upload the script to a generated `/tmp/scriptmanager-wf-*` path, run it with the resolved interpreter, capture stdout/stderr, then remove the uploaded file.

### Agent live session control

- Provider processes now launch through tokio (`tokio::process`) with piped streams; the previous blocking `std::process::Command::output()` call stalled an async worker for the whole provider run.
- Git subprocesses (`run_git_action`, `git_probe`, `git_clone_project`) now run through the blocking pool so network fetch/push/clone operations cannot stall async workers either.
- Runs execute in background monitor tasks tracked by a live session registry; interrupt/terminate target the live process and persist `interrupted`/`terminated` terminal states with audit messages.
- Provider stdout/stderr stream to the renderer as `agent-event` refreshes and persist as structured messages (JSONL lines keep their parsed event; long lines are truncated).
- Claude is wired to its documented non-interactive print mode (`claude -p <prompt> --output-format json`) with the same fixed-identity argument-array safety model as Codex.

### Bug fixes found by the visible-app smoke

- `run_script_in_terminal` failed with "Terminal session not found" when the desktop Run button fired before the terminal panel mounted. The command now creates the PTY session on demand, and `create_terminal` no longer clobbers an existing live session (which would have killed a running script). A comctl32 delay-load linker change keeps `cargo test` binaries loadable now that rfd/tao objects link comctl32 v6 imports.
- The workflow node inspector rendered resource fields (script/API request/profile/agent profile) as free-text inputs, so users stored display names where the engine expected ids and runs failed with "Script not found". The inspector now renders resource selects storing ids, and the engine resolves scripts, API requests, and profiles by id first with a display-name fallback for previously saved workflows.
- Cancelling a workflow run while a node was executing was overwritten to `failed` by the driver's node error path; the driver now records cancelled runs and nodes as cancelled. A new regression test (`workflow_run_cancel_marks_run_and_nodes_cancelled`) covers it.

### Visible-app smoke evidence (evening pass)

- Scripts: created `Smoke Feature Check.py` through the New Script dialog, edited content, added a `DELAY_SECONDS` parameter, saved, ran through the Run-parameters dialog — the script executed in the terminal with `bg-run-start 120` (parameter injected as env var). Typed `echo …` into the terminal via real keyboard events and PowerShell executed it. Killed the running terminal: the python process terminated with no lingering `__term.py` process.
- Workflows: created the Script pipeline template, configured both script nodes through the new resource picker, saved, published v1, ran (Succeeded), and used `Retry Prepare` on the earlier failed run — the node re-ran and the run flipped to Succeeded with persisted node output `{"exitCode": 0, "stdout": "Hello World"}`.

## Source And Build Evidence (Earlier Pass)

- `npx tsc --noEmit` passed.
- `npm run guard:no-api-fallback` passed.
- `npm run guard:desktop-bridge` passed.
- `npm run build` passed. Vite reported the existing large chunk warning for `index--d6mMYz4.js`.
- `cargo test --lib -- --nocapture` passed: 140 tests, 0 failed.
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
- Added a native Codex provider process launch contract: Tauri resolves only the fixed allowlisted `codex` executable identity, launches `codex exec` with argument arrays, and persists stdout/stderr plus terminal status into durable agent run messages. Focused Rust tests cover the command shape and final-state persistence without invoking a live provider session.
- Clarified local-only cloud storage support and disabled unsupported provider claims.
- Preserved plugin registry metadata while explicitly disabling plugin execution host claims.
- Documented the remote execution SSH/SFTP target architecture: `russh` plus `russh-sftp`.
- Added native protected-Git approval integration: protected Git actions create/reuse approval requests, block while pending, honor rejected decisions, and proceed after an approved matching request.
- Added native Git dispatcher verification for status, log, branches, diff, add/stage, reset/unstage, commit, push, fetch, and pull using a temporary local repo and bare origin.
- Added visible and source-level proof for Tauri open-folder restart behavior: the dialog opens after restart, accepts the renderer camelCase `folderPath` payload, and linked-folder scripts read/save/run against their canonical source files with containment checks.
- Added API send/history UI proof in the visible Tauri window and refreshed Redux history state immediately after successful native sends so newly inserted native history records appear in the API sidebar.
- Added disposable SSH-identification integration proof for the remote connection test: a local test server emits an `SSH-` banner and asserts the Tauri client sends `SSH-2.0-ScriptManager_Tauri`.
- Added remote execution approval-finalization proof: approved Tauri remote executions now emit renderer-compatible `remote-exec-event` line/error payloads and persist a failed migration-pending terminal state with output, log output, exit code, timestamps, and audit evidence instead of silently emitting a synthetic done event.
- Added Git workbench UI proof against a disposable local repository: status loaded one modified file, diff rendered, `Commit All Changes` produced a local commit, the working tree refreshed clean, and History showed the new commit.
- Updated operator/troubleshooting/docs language from Electron-hosted assumptions to Tauri-hosted behavior.

## Remaining Manual Or External Verification

- Gist live sync/delete still needs a real GitHub token.
- Remote SSH/SFTP transport is implemented and covered by in-process SSH-server integration tests; a live run against a real network SSH host still needs external credentials.
- ACP permission-request approvals and richer ACP artifact/usage persistence need a live provider session; Codex/Claude launch, streaming, and interrupt/terminate are implemented and test-covered.
- Agent workflow nodes and plugin workflow nodes remain pending behind clear persisted failure states (agent process control exists; node wiring and plugin host are milestone-pending).
- Workflow cancel/retry are covered by Rust tests and the visible Retry UI pass; a visible Cancel click needs a long-running workflow in the UI.
- Protected Git approval consumption is source-complete for matching protected Git action requests; local Git workbench status/log/commit-safe UI smoke is verified, while protected remote fetch/pull/push approval retry remains source-level only.

## Known Non-Blocking Warnings

- Rust emits existing unused import/unused variable/dead code warnings in modules including `scan.rs`, `security.rs`, `execution.rs`, `approvals.rs`, `notifications.rs`, `observability.rs`, `plugins.rs`, and `remote_exec.rs`.
- Vite emits an existing large-chunk warning after production build.
