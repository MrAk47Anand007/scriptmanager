# ScriptManager Automation and AI Platform Design

## Product direction

ScriptManager will evolve from a script, API, and remote-operations workbench into a local-first automation platform. Users will build multi-step workflows from scripts, API requests, remote commands, approval gates, and AI-agent tasks. The existing Next.js application remains the UI and server, while Electron becomes the trusted desktop host for local ACP agents, filesystem access, terminals, and OS-level approval prompts.

## Scope and delivery boundaries

The work is split into independently shippable phases:

1. Quality and security foundation
2. Workflow engine and visual workflow builder
3. Execution dashboard and observability
4. Notifications and approval inbox
5. Shared encrypted secret vault
6. ACP agent runtime with Codex and Claude adapters
7. Git-backed projects
8. Teams, roles, and workspace policy
9. Plugin SDK and integration marketplace
10. Production hardening, documentation, and release

Each phase must work without later phases. AI agents are workflow-capable after Phase 6, but the core workflow engine cannot depend on an AI provider.

## Architecture

### Core server

Next.js route handlers and focused services own durable product state in SQLite through Prisma. Long-running work is represented as queued jobs with persisted state rather than being tied to an HTTP request. A worker service claims jobs, emits structured events, records retries, and resumes recoverable runs after restart.

### Desktop host

Electron owns privileged local capabilities: spawning ACP providers, terminal processes, filesystem grants, native notifications, OAuth, and secure credential storage. Renderer code accesses these capabilities only through typed preload APIs. The web build never receives a silent fallback that grants desktop capabilities.

### Workflow runtime

A workflow is a versioned directed graph. Node types include script, API request, remote command, AI agent, condition, transform, delay, approval, parallel branch, and notification. Node inputs use explicit mappings from trigger data, workflow variables, secrets, or earlier node outputs. Runs persist node-level state, attempts, logs, artifacts, timing, and cancellation state.

Cycles are rejected in version one. Parallel branches are allowed, and a join waits for all required inbound branches. Failed nodes follow their configured retry and failure policy. A workflow can be triggered manually, by cron, webhook, or another workflow.

### ACP agent runtime

The agent subsystem uses a provider-neutral ACP session interface. Codex and Claude are adapters behind the same contract; no workflow or UI component depends directly on a provider CLI.

An agent profile specifies provider, executable, model/config arguments, workspace roots, environment allowlist, permission profile, and protected-action policy. Phase one is desktop-first. The self-hosted web UI may inspect persisted runs, but launching a local agent requires the Electron host. A later trusted worker daemon can implement the same host contract for web deployments.

### Agent permissions and approval

Every new agent connection asks the user to select an access profile:

- `observe`: read-only workspace inspection; no writes or arbitrary commands.
- `develop`: workspace reads and writes; commands and external actions follow policy and may require approval.
- `full`: broad local autonomy for the granted workspace and run, but protected operations always require approval.

Protected operations include secret access, writes outside granted roots, destructive filesystem commands, privilege escalation, remote execution, Git push, pull-request mutation, deployment, production changes, and modifying the permission policy itself.

Approval requests display the actor, requested capability, exact command or operation, affected resources, risk, reason, and expiration. Decisions are `allow_once`, `allow_run`, `allow_workspace`, or `reject`. Persistent grants are scoped by provider, workspace, capability, and policy version and can be revoked from Settings. No provider-supplied text can bypass policy enforcement.

### Secrets

Secrets are stored once and referenced by opaque identifiers. Plaintext is resolved only inside the execution boundary immediately before use and is never serialized into workflow definitions, agent transcripts, logs, Redux state, or API responses. Electron uses OS-backed secure storage where available; self-hosted mode requires an administrator-supplied encryption key and refuses secure features when only a built-in fallback key is available.

### Observability

All script, API, remote, workflow, and agent executions emit a common event envelope. The dashboard displays active runs, failure rate, duration, retries, schedules, approvals, and agent token/cost metadata when providers expose it. Logs support filtering and redaction. Retention limits apply independently to logs, artifacts, and transcripts.

### Notifications

Notification channels initially include desktop, generic webhook, Slack-compatible webhook, SMTP email, and Microsoft Teams-compatible webhook. Rules subscribe to typed execution events and support throttling and deduplication. Approval notifications link back to the local application but never contain secrets or full command output.

### Git projects

Projects may bind to a repository root. The workbench exposes status, diff, branches, commits, pull/fetch, and optional push. Mutating or remote Git actions are policy-controlled, and agent Git actions pass through the same approval service as human-triggered operations.

### Teams and roles

Single-user local mode remains the default. Multi-user server mode introduces workspace membership and roles: owner, admin, developer, operator, approver, and viewer. Authorization is enforced server-side at the resource/action level. Agent sessions act as the initiating user plus the agent profile; they never gain permissions the user does not possess.

### Plugins

Plugins are signed or explicitly trusted local packages with a manifest declaring node types, settings schema, required capabilities, and server/desktop entry points. Plugins run through narrow host APIs and cannot directly access Prisma, Electron internals, or raw secrets.

## Error handling and recovery

- Persist state before and after each node attempt.
- Use idempotency keys for webhook triggers and retryable external writes.
- Mark interrupted local processes as `interrupted` after restart; resume only nodes explicitly declared resumable.
- Redact registered secrets and common credential patterns before persistence.
- Apply bounded exponential backoff with jitter.
- Make cancellation cooperative first, then terminate child process trees after a grace period.
- Preserve the last valid workflow version when a draft is invalid.

## Testing strategy

- Vitest unit tests for graph validation, mappings, policy evaluation, redaction, adapters, and reducers.
- Integration tests against a temporary SQLite database for routes, worker claims, retries, approvals, and RBAC.
- Contract tests using fake ACP providers for session lifecycle, streaming, tool requests, cancellation, and provider failure.
- Playwright tests for workflow authoring, approval prompts, dashboards, secrets, and agent runs.
- Electron smoke tests for preload boundaries, process spawning, secure storage, and native notifications.
- Security regression tests proving protected actions cannot be invoked through alternate routes or provider-crafted payloads.

## Non-goals for the first release

- Autonomous production deployment without approval.
- Browser-only spawning of local agents.
- Arbitrary cyclic workflows.
- A public unreviewed plugin marketplace.
- Storing raw secrets in workflow variables or agent context.
- Provider-specific behavior in shared workflow contracts.

## Success criteria

A user can build a workflow containing script, API, approval, and ACP-agent nodes; connect either Codex or Claude; select an access profile; review protected actions; monitor the run live; receive failure or approval notifications; inspect redacted history; and rerun failed nodes without losing auditability.

