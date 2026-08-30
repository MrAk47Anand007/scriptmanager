# ScriptManager Automation and AI Platform Master Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ScriptManager into a reliable workflow automation and ACP-agent workbench while preserving its local-first script, API, cloud-sync, and Ops capabilities.

**Architecture:** Deliver the product as ten gated phases. Next.js and Prisma own durable orchestration state; a background worker executes jobs; Electron exposes privileged local capabilities through typed IPC; provider-neutral contracts isolate ACP agents and plugins.

**Tech Stack:** Next.js 15, React 19, TypeScript, Redux Toolkit, Prisma 6 with SQLite, Electron 40, Vitest, Playwright, ACP-compatible provider processes.

## Global Constraints

- Desktop-first ACP execution; web mode may inspect agent runs but cannot silently spawn local providers.
- Support Codex and Claude through the same provider-neutral ACP interface.
- Ask the user to select Observe, Develop, or Full access for every new agent connection unless a valid scoped grant exists.
- Full access never bypasses protected-action approval.
- Never persist plaintext secrets in definitions, logs, transcripts, Redux, or API responses.
- Preserve all existing script, API, Ops, cloud-storage, CLI, web, and Electron behavior.
- Every phase requires automated tests and a successful `npm run build` before completion.

---

## Delivery map

### Phase 1: Quality and security foundation

**Deliverable:** A testable execution foundation with secure configuration and shared event contracts.

- [ ] Add Vitest, Testing Library, Playwright, temporary-database helpers, and `test`, `test:unit`, `test:integration`, and `test:e2e` scripts.
- [ ] Add unit coverage for execution safety, request materialization, storage encryption, scheduling, and authentication.
- [ ] Replace built-in production secret fallbacks with startup validation and documented development-only behavior.
- [ ] Introduce `ExecutionEvent`, `ExecutionActor`, `ExecutionTarget`, and redaction contracts under `src/lib/execution/`.
- [ ] Add structured logging and correlation IDs to script, API, remote-execution, and webhook entry points.
- [ ] Add database migration and repository helpers for durable execution events.
- [ ] Fix Next.js workspace-root configuration and existing build warnings that affect release confidence.
- [ ] Update README feature inventory and architecture documentation.

**Exit gate:** Unit and integration suites run in CI; existing product builds; secure features reject missing production keys.

### Phase 2: Workflow engine and builder

**Deliverable:** Versioned workflows built from existing ScriptManager capabilities.

- [ ] Add Prisma models for `Workflow`, `WorkflowVersion`, `WorkflowRun`, `WorkflowNodeRun`, and `WorkflowTrigger`.
- [ ] Define versioned schemas for script, API, remote, condition, transform, delay, approval, parallel, join, notification, and agent nodes.
- [ ] Implement graph validation, topological planning, variable mappings, node retries, timeouts, cancellation, and failure policies.
- [ ] Implement a database-backed worker with atomic job claims and restart reconciliation.
- [ ] Add manual, cron, and signed-webhook triggers with idempotency keys.
- [ ] Add workflow CRUD, publish, validate, run, cancel, retry-node, and event-stream routes.
- [ ] Add Redux workflow state and a visual canvas with node palette, inspector, connections, validation, draft/publish, and run controls.
- [ ] Add workflow templates for script pipeline, API-to-script, approval deploy, and remote maintenance.

**Exit gate:** A published workflow can execute scripts, API requests, conditions, approvals, and parallel branches with persisted node state.

### Phase 3: Execution dashboard and observability

**Deliverable:** One operational view across every execution type.

- [ ] Add aggregated metrics queries for active, success, failure, timeout, retry, duration, and schedule health.
- [ ] Build dashboard summary, active-runs, failure-trend, schedule-health, and recent-event views.
- [ ] Add unified run detail with timeline, node attempts, redacted logs, artifacts, actor, and correlation ID.
- [ ] Add filters for type, workflow, script, status, trigger, user, provider, project, and time range.
- [ ] Add cancel, retry run, retry failed node, and download-redacted-log actions.
- [ ] Add configurable retention and cleanup jobs for logs, transcripts, and artifacts.

**Exit gate:** Operators can identify a failure, inspect its causal node and input provenance, and retry it without replaying completed non-idempotent work.

### Phase 4: Notifications and approval inbox

**Deliverable:** Event-driven notifications and one place to handle pending approvals.

- [ ] Add `NotificationChannel`, `NotificationRule`, `NotificationDelivery`, `ApprovalRequest`, and `ApprovalDecision` models.
- [ ] Implement desktop, generic webhook, Slack webhook, SMTP, and Teams webhook adapters.
- [ ] Add event matching, templates, throttling, deduplication, retries, and delivery audit.
- [ ] Build notification settings, channel test, rule editor, and delivery-history screens.
- [ ] Build an approval inbox with risk, exact operation preview, affected resources, expiry, and audit history.
- [ ] Support Allow once, Allow for run, Always allow for workspace, and Reject decisions.
- [ ] Add native desktop notifications and deep links for pending approvals.

**Exit gate:** Failures and approval requests reach configured channels, and every decision is scoped and auditable.

### Phase 5: Shared encrypted secret vault

**Deliverable:** A single secure credential system for scripts, APIs, Ops, storage, workflows, and agents.

- [ ] Add `Secret`, `SecretVersion`, `SecretBinding`, and `SecretAccessEvent` models storing ciphertext and metadata only.
- [ ] Define a `SecretStore` interface with Electron OS-backed and server master-key implementations.
- [ ] Implement create, rotate, disable, reference, reveal-once, and audit operations.
- [ ] Add server-side capability checks and prevent secret plaintext from entering serialized execution inputs.
- [ ] Migrate script env secrets, SSH credentials, storage provider secrets, and API credentials to references.
- [ ] Add vault UI with scope, usage references, rotation state, and access history.
- [ ] Add redaction regression tests across logs, events, API responses, exports, and ACP transcripts.

**Exit gate:** Existing integrations work through vault references, and automated tests cannot recover plaintext from persisted product records.

### Phase 6: ACP agents with Codex and Claude

**Deliverable:** Safe, provider-neutral AI agents that can participate in workflows.

- [ ] Define `AcpProviderAdapter`, `AcpSession`, `AcpMessage`, `AcpToolRequest`, `AcpPermissionRequest`, and `AcpUsage` contracts.
- [ ] Add Electron preload/main IPC for provider discovery, launch, stream, input, permission decision, interrupt, and terminate.
- [ ] Implement Codex ACP and Claude ACP adapters behind the shared contract.
- [ ] Add fake-provider contract tests covering initialization, prompts, streaming, tool requests, errors, cancellation, and reconnect behavior.
- [ ] Add `AgentProfile`, `AgentRun`, `AgentMessage`, `AgentArtifact`, `PermissionGrant`, and provider configuration models.
- [ ] Implement Observe, Develop, and Full permission profiles with protected actions that always require approval.
- [ ] Add first-connection access selection and scoped grant management.
- [ ] Route agent commands, file writes, secret reads, Git operations, remote execution, and deployment requests through the approval service.
- [ ] Build Agents activity view, provider setup, profile editor, chat/run transcript, artifacts, context picker, interrupt, resume, and permission screens.
- [ ] Add the workflow `agent` node with prompt templates, structured input/output schema, timeout, provider selection, artifact capture, and approval pause/resume.
- [ ] Persist redacted transcripts and provider usage/cost metadata when available.
- [ ] Show a clear desktop-host-required state in browser-only mode.

**Exit gate:** The same workflow agent node runs with Codex or Claude, asks for the selected access level, pauses protected actions for user approval, and produces auditable outputs.

### Phase 7: Git-backed projects

**Deliverable:** Repository-aware script and agent workspaces.

- [ ] Extend projects with repository root, default branch, remote metadata, and workspace policy.
- [ ] Add a Git service for status, diff, branch, commit, fetch, pull, and push using argument-safe process spawning.
- [ ] Build source-control sidebar, diff viewer, commit form, branch picker, and conflict state.
- [ ] Allow workflows and agent profiles to select a repository workspace.
- [ ] Require approval for push, force operations, destructive cleanup, and writes outside granted roots.
- [ ] Record human and agent Git actions in the unified audit trail.

**Exit gate:** Users and approved agents can safely inspect and modify repository-backed projects without bypassing workspace policy.

### Phase 8: Teams, RBAC, and workspace policy

**Deliverable:** Secure optional multi-user server mode.

- [ ] Add `User`, `Workspace`, `Membership`, `Role`, `RolePermission`, and invitation/session models.
- [ ] Migrate existing data into a default workspace owned by the current administrator.
- [ ] Enforce resource/action authorization in services and routes, not only UI visibility.
- [ ] Ship owner, admin, developer, operator, approver, and viewer role presets.
- [ ] Bind agent authority to the initiating user intersected with its profile and workspace policy.
- [ ] Add user, role, membership, session, grant-revocation, and audit screens.
- [ ] Add authorization matrix tests for scripts, workflows, secrets, agents, approvals, Ops, and Git.

**Exit gate:** Cross-workspace access is denied by default, and agents cannot exceed the initiating user’s authority.

### Phase 9: Plugin SDK and integration marketplace

**Deliverable:** Extensible workflow nodes and providers without modifying core modules.

- [ ] Define manifest schema, compatibility version, capabilities, settings schema, node contract, and lifecycle hooks.
- [ ] Implement explicit local trust/install/uninstall/enable/disable flows.
- [ ] Add restricted host APIs for HTTP, events, vault references, storage, and desktop capabilities.
- [ ] Build plugin registry, settings pages, node discovery, health reporting, and update checks.
- [ ] Provide SDK types, a generator, documentation, and example notification and workflow-node plugins.
- [ ] Add signature verification support while keeping unsigned local development an explicit opt-in.

**Exit gate:** An example plugin adds a tested workflow node without importing Prisma or accessing raw secrets.

### Phase 10: Production hardening and release

**Deliverable:** Documented, upgradeable releases for desktop and self-hosted use.

- [ ] Add CI for unit, integration, Playwright, Electron smoke, migration, packaging, and security regression tests.
- [ ] Add database backup, restore, migration preflight, rollback documentation, and corrupted-run recovery.
- [ ] Add rate limits, request size limits, webhook replay protection, CSP, dependency scanning, and audit export.
- [ ] Add accessibility checks, keyboard navigation, reduced motion, and large-data performance tests.
- [ ] Add signed desktop installers, update channels, release notes, and upgrade compatibility checks.
- [ ] Rewrite README and operator, security, ACP provider, workflow, plugin, and troubleshooting guides.
- [ ] Run an end-to-end acceptance scenario spanning webhook, API, script, approval, Codex/Claude agent, remote action, notification, and audit export.

**Exit gate:** Both deployment modes have repeatable install/upgrade paths, documented security boundaries, and green acceptance evidence.

## Recommended implementation sequence

Execute phases in order. Phase 6 depends on Phases 1, 2, 4, and 5. Phase 7 may begin after Phase 5, but its agent integration waits for Phase 6. Phase 8 must precede any shared hosted deployment. Phase 9 starts only after execution, policy, and secret interfaces stabilize.

## Release milestones

- **Milestone A — Reliable Automations:** Phases 1–3.
- **Milestone B — Controlled Operations:** Phases 4–5.
- **Milestone C — AI Automation Workbench:** Phase 6.
- **Milestone D — Collaborative Developer Platform:** Phases 7–8.
- **Milestone E — Extensible Production Platform:** Phases 9–10.

