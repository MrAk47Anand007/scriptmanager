# Changelog

## Unreleased — Tauri desktop

### Added

- **AI Access (MCP):** the desktop binary now doubles as an MCP stdio server (`--mcp`), exposing 14 tools — workflows (list/get/run/status/cancel), scripts (list/get/run), API requests (list/send), agent runs, and pending approvals — to any MCP client (Claude Desktop, Codex, Zed). One-click install into Claude Desktop and Codex config files plus copyable snippets live in the Agents panel's AI Access card. Access is strictly on-demand: agents only act when the user asks.
- **Workflow agent nodes:** the `agent` node type runs at runtime — it resolves the profile's provider CLI, templates the prompt against run context, and exposes the reply as node output.
- **Workflow approvals:** approval nodes pause runs and can be approved/rejected from the execution drawer; approval resumes downstream nodes in the background, rejection fails the run.
- **Workflow cron triggers:** schedule a published workflow with a 5-field cron via the command bar's Triggers dialog; the scheduler advances next-fire before starting (run-once policy for missed ticks).
- **Agent discovery v2:** provider discovery scans well-known install dirs (npm global, Volta, nvm, scoop, bun, cargo), probes `--version`, detects desktop-only installs with actionable CLI install hints, and supports manual CLI path overrides per provider stored in settings.
- **Real agent resume:** resuming a finished agent run relaunches the provider with the prior conversation transcript plus the follow-up instruction instead of reporting "migration-pending".
- **Workflows UX:** keyboard shortcuts (Ctrl+S save, Ctrl+P publish, Ctrl+Enter run, Ctrl+Z/Ctrl+D undo-redo-duplicate), clipboard import/export of workflow JSON, per-node and per-run timing in the execution drawer, run-started toast.
- **Ops console:** summary cards now show real data (all pending approvals across systems, active executions, success rate from the observability dashboard) plus a new Runs tab embedding the cross-domain execution dashboard.

### Changed

- Workflow runs start in the background: `run_workflow` returns the running detail immediately instead of blocking until completion; the execution drawer keeps polling.
- The MCP `workflow_run_status`, run summaries, and agent run lists are bounded (limit clamps) so chatty agents cannot flood responses.

### Fixed

- Agent-profile picker in the workflow inspector rendered empty options (agent nodes could not be selected).
- Duplicate `readSettings` key in the desktop bridge.
- Runs can no longer get stuck in `running` forever if the workflow driver crashes between node updates — a safety net marks them failed.

## 1.0.0 - 2026-07-13

ScriptManager 1.0 completes the local-first automation and AI workbench roadmap: durable workflows and observability, approvals and notifications, encrypted secrets, Codex/Claude ACP agents, Git projects, workspace RBAC, capability-scoped plugins, and production release controls.

### Release requirements

- Back up the SQLite database before upgrading.
- Run `npm run release:preflight` with the production environment loaded.
- Node.js 22 or newer is required for self-hosted deployments.
- Stable desktop tags require platform signing credentials; unsigned builds are development artifacts only.
