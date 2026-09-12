# Workflow Operations

Published workflow versions are immutable acyclic graphs. Runs execute in the background: starting a run returns immediately and the execution drawer polls for progress (2s while a run is active). Manual runs, cron triggers, and MCP `workflow_run` calls all share this driver. Approval nodes pause descendants until a decision is recorded; retries obey bounded policy, and cancellation is cooperative.

Node types: `script`, `api`, `remote`, `condition`, `transform`, `delay`, `approval`, `parallel`, `join`, `notification`, `agent` (plus `plugin:*` placeholders). The `agent` node resolves the configured profile's provider CLI, templates the prompt against the run context, and exposes the provider's reply as the node output — the node's timeout (default 60s, max 300s) bounds a runaway provider.

## Approvals

An approval node marks the run `paused` with the node `waiting_approval`. Approve or reject it from the execution drawer (select the node, then Approve/Reject). Approving resumes the remaining downstream nodes in the background; rejecting fails the run with a "Rejected by …" error. The decision is recorded on the node output.

## Triggers (cron)

Workflows can run on a 5-field cron schedule via the **Triggers** button in the command bar (requires a published version). The desktop scheduler advances the next fire time before starting each run, so a missed tick fires once, not per tick. Trigger state lives in the `workflow_triggers` table.

## Sharing

Export copies the workflow definition JSON to the clipboard; Import accepts a pasted definition (`schemaVersion: 1`) and creates a new workflow from it.

## Builder shortcuts

- `Ctrl+S` save · `Ctrl+P` publish · `Ctrl+Enter` run
- `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) undo/redo · `Ctrl+D` duplicate selection
- `Delete`/`Backspace` removes selected nodes (canvas handles this)

## AI access

The built-in MCP stdio server (see `docs/acp-providers.md`) exposes `workflow_list`, `workflow_get`, `workflow_run`, `workflow_run_status`, `workflow_runs_list`, and `workflow_run_cancel` so AI agents can operate workflows on the user's request. Use correlation IDs to connect workflow, script, API, remote, ACP, notification, plugin, and audit records. Never place credentials in workflow variables; use opaque vault references.
