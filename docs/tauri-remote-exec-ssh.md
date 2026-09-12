# Tauri Remote Execution SSH/SFTP Design

## Decision

The Tauri remote execution transport is implemented with `russh` plus `russh-sftp` (`ssh_transport.rs`).

Rationale:

- The implementation stays pure Rust and avoids linking to system `libssh2`/OpenSSL distributions.
- Async command streaming maps naturally to the existing `remote-exec-event` channel.
- SFTP is preferred over legacy SCP for file transfer because it has clearer path and metadata semantics.
- Host-key verification and authentication policy remain application-owned instead of hidden behind shell commands.

## Security Model

- Never invoke `ssh`, `scp`, `powershell`, or shell-built commands for remote transport.
- Resolve secrets only inside the Rust command boundary immediately before connection use.
- Store only encrypted credential records in SQLite (`server_profiles.encrypted_secret`, AES-256-GCM via the vault master key).
- Require host-key verification before command execution or file transfer. The first connection records a SHA-256 fingerprint (`host_key_fingerprint`, trust on first use); any later mismatch is a hard typed error, never silent acceptance.
- Command execution uses SSH `exec` requests; remote commands are built only from the interpreter name and a generated temp path, shell-quoted. Script content travels as a file, never as part of the command line.
- Keep repository/workspace path containment checks before transferring local files. Remote paths must be absolute.
- Emit `remote-exec-event` records for connection, stdout/stderr lines, exit, and failure states.
- Preserve approval gates for protected profiles/executions before opening the SSH session.
- Redact password, private key, passphrase, token, and environment secret values from logs, audit output, events, and renderer payloads.

## Implemented

- `russh` (ring backend) and `russh-sftp` dependencies.
- Connection test: TCP/SSH banner probe, plus a full authenticated SSH handshake with host-key pinning whenever the profile stores credentials.
- Command execution over SSH with streamed `remote-exec-event` line/error/done events and persisted output, exit code, and audit rows (exit 255 for transport failures).
- Script transfer over SFTP upload (`transfer_remote_script`) with optional octal permissions via SETSTAT.
- Workflow remote nodes: upload the script over SFTP to a generated `/tmp/scriptmanager-wf-*` path, execute it with the resolved interpreter, capture stdout/stderr, then remove the uploaded file.
- Integration tests against a disposable in-process russh SSH/SFTP server (password auth, canned exec output, in-memory SFTP filesystem), covering exec streaming, SFTP upload, host-key mismatch rejection, and authenticated connection tests.
