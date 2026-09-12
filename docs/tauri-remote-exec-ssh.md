# Tauri Remote Execution SSH/SCP Design

## Decision

Use `russh` plus `russh-sftp` for the Tauri remote execution transport when SSH/SCP is ported.

Rationale:

- The implementation stays pure Rust and avoids linking to system `libssh2`/OpenSSL distributions.
- Async command streaming maps naturally to the existing `remote-exec-event` channel.
- SFTP is preferred over legacy SCP for file transfer because it has clearer path and metadata semantics.
- Host-key verification and authentication policy remain application-owned instead of hidden behind shell commands.

## Security Model

- Never invoke `ssh`, `scp`, `powershell`, or shell-built commands for remote transport.
- Resolve secrets only inside the Rust command boundary immediately before connection use.
- Store only opaque secret references or encrypted credential records in SQLite.
- Require host-key verification before command execution or file transfer. The first implementation may support an explicit trust-on-first-use prompt, but silent host-key acceptance is not allowed.
- Use argument arrays or protocol APIs for remote commands and transfer paths. Do not concatenate command strings from renderer input.
- Keep repository/workspace path containment checks before transferring local files.
- Emit `remote-exec-event` records for connection, transfer, stdout, stderr, exit, approval, cancellation, and failure states.
- Preserve approval gates for protected profiles/executions before opening the SSH session.
- Redact password, private key, passphrase, token, and environment secret values from logs, audit output, events, and renderer payloads.

## Pending Implementation Tasks

- Add `russh` and `russh-sftp` dependencies after evaluating Windows packaging impact.
- Implement connection test with host-key verification.
- Implement upload/download over SFTP with containment checks.
- Implement command execution streaming through `remote-exec-event`.
- Add a mock or disposable SSH server integration test in CI or a documented local smoke path.
