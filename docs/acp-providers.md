# ACP Providers

ScriptManager supports provider-neutral ACP profiles for Codex and Claude. In the Tauri desktop app, provider discovery scans `PATH` plus well-known install locations (npm global, Volta, nvm, scoop, bun, cargo), probes `--version`, and never launches anything during discovery. Profile creation and process launch happen only in the desktop runtime with fixed, allowlisted argument shapes (`codex exec --json …`, `claude -p … --output-format json`). Browser-only deployments may inspect persisted runs but cannot launch providers.

## CLI vs desktop apps

Headless agent runs require the **CLI**, not the desktop app. The Claude Desktop app and the Codex desktop app cannot be driven as ACP/JSONL child processes, so the Agents panel shows them as "Desktop app only" with an install hint for the CLI:

- Codex CLI: `npm install -g @openai/codex`
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`

If the CLI is installed outside `PATH` (common for GUI-launched apps on Windows), set a manual CLI path per provider in the Agents panel; the override is stored in settings and validated on save.

## Sessions

Runs are persisted (`agent_runs`, `agent_run_messages`) and stream via `agent-event`. Interrupt/terminate kill the live provider process. Resume relaunches the provider with the prior conversation transcript plus the follow-up instruction, keeping one persistent ScriptManager run thread (the CLIs themselves are ephemeral).

Profiles grant Observe, Develop, or Full access to explicit workspace roots. Full does not bypass protected operations: secret reads, destructive commands, writes outside roots, remote execution, Git push/PR mutation, deployment, production changes, and permission-policy changes still require approval. Credentials are `secret://` vault references and transcripts, artifacts, errors, and usage metadata are redacted before persistence.

## AI Access (MCP)

ScriptManager ships a built-in MCP stdio server so any MCP client (Claude Desktop, Codex, Zed, …) can use saved workflows, scripts, and API requests as tools on the user's request — nothing runs automatically. Run the desktop binary with `--mcp` (or `--mcp-stdio`) to serve newline-delimited JSON-RPC 2.0 with `initialize`, `tools/list`, and `tools/call`.

Tools: `app_overview`, `workflow_list`, `workflow_get`, `workflow_run`, `workflow_run_status`, `workflow_runs_list`, `workflow_run_cancel`, `script_list`, `script_get`, `script_run`, `api_request_list`, `api_request_send`, `agent_run_list`, `approval_list`.

The Agents panel's **AI Access (MCP)** card can install the server entry into Claude Desktop's `claude_desktop_config.json` or Codex's `~/.codex/config.toml` with one click (existing config is preserved) and offers copyable snippets for manual setup. `workflow_run` starts runs in the background; poll `workflow_run_status` until completion.

Validate each installed provider with a disposable repository and Observe access first. Confirm stream, interrupt, resume, approval, and audit behavior before granting Develop or Full.
