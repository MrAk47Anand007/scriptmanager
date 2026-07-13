# ACP Providers

ScriptManager supports provider-neutral ACP profiles for Codex and Claude. Provider discovery and process launch occur only in Electron, from the allowlisted `codex-acp` and `claude-agent-acp` executable identities. Browser-only deployments may inspect persisted runs but cannot launch providers.

Profiles grant Observe, Develop, or Full access to explicit workspace roots. Full does not bypass protected operations: secret reads, destructive commands, writes outside roots, remote execution, Git push/PR mutation, deployment, production changes, and permission-policy changes still require approval. Credentials are `secret://` vault references and transcripts, artifacts, errors, and usage metadata are redacted before persistence.

Validate each installed provider with a disposable repository and Observe access first. Confirm stream, interrupt, resume, approval, and audit behavior before granting Develop or Full.
