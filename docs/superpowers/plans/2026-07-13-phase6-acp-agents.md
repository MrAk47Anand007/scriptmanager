# Phase 6 ACP Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, provider-neutral Codex and Claude agents that run in the desktop host, participate in workflows, pause protected actions for approval, and persist redacted auditable outputs.

**Architecture:** A focused `src/lib/agents` domain owns contracts, access policy, persistence, orchestration, and workflow integration. Electron owns local provider process discovery and lifecycle through typed IPC; the web app owns durable profiles/runs and an activity surface, while browser-only sessions remain inspect-only.

**Tech Stack:** TypeScript, Next.js 15, React 19, Prisma 6/SQLite, Electron IPC and child processes, Vitest.

## Global Constraints

- Reuse Phase 4 approvals for every permission request and protected action, including Full access.
- Reuse Phase 5 vault references; plaintext credentials exist only ephemerally inside trusted runtime boundaries.
- Provider processes are desktop-hosted. Browser-only mode may inspect durable runs but cannot launch providers.
- Persist redacted transcripts, artifacts, permission decisions, and usage metadata with correlation IDs.
- Add fake-provider contract tests before connecting Codex or Claude processes.
- Preserve all existing script, API, Ops, storage, workflow, Electron, and browser behavior.

---

### Task 1: ACP contracts and provider session runtime

**Files:**
- Create: `src/lib/agents/types.ts`
- Create: `src/lib/agents/provider.ts`
- Create: `src/lib/agents/jsonLineAdapter.ts`
- Create: `src/lib/agents/codexAdapter.ts`
- Create: `src/lib/agents/claudeAdapter.ts`
- Test: `tests/unit/acpProviderContract.test.ts`

**Interfaces:**
- Produces `AcpProviderAdapter`, `AcpSession`, `AcpMessage`, `AcpToolRequest`, `AcpPermissionRequest`, `AcpUsage`, `AcpEvent`, and adapter factories.

- [ ] Write fake-provider tests for discovery, initialization, prompt/input, streaming messages and artifacts, tool/permission requests, usage, provider errors, interrupt, terminate, and reconnect.
- [ ] Run `npx vitest run tests/unit/acpProviderContract.test.ts` and confirm failure because the contracts/runtime do not exist.
- [ ] Implement the minimal async-session contract and JSON-lines process transport with abort-safe cleanup and event replay after reconnect.
- [ ] Add Codex and Claude command/argument/event normalization adapters without provider-specific types escaping the shared contract.
- [ ] Run the focused test and commit `feat: add provider-neutral ACP runtime`.

### Task 2: Agent persistence and redaction

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713143000_add_agent_runtime/migration.sql`
- Create: `src/lib/agents/redaction.ts`
- Create: `src/lib/agents/repository.ts`
- Test: `tests/integration/agentRepository.test.ts`

**Interfaces:**
- Produces durable provider configurations, `AgentProfile`, `AgentRun`, `AgentMessage`, `AgentArtifact`, and `PermissionGrant` records plus repository CRUD/append/status methods.

- [ ] Write integration tests proving profiles/configuration store secret references only, transcripts/artifacts redact registered values, usage and correlation IDs persist, and run transitions are resumable.
- [ ] Run the focused test and confirm missing Prisma models/repository failure.
- [ ] Add the models, indexes, migration, redactor, and repository transaction boundaries.
- [ ] Generate Prisma Client, run the migration against the isolated test database copy, and run the focused test.
- [ ] Commit `feat: persist redacted agent runs`.

### Task 3: Access profiles and approval routing

**Files:**
- Create: `src/lib/agents/accessPolicy.ts`
- Create: `src/lib/agents/approvalRouter.ts`
- Modify: `src/lib/approvals/service.ts`
- Test: `tests/unit/agentAccessPolicy.test.ts`
- Test: `tests/integration/agentApprovalRouter.test.ts`

**Interfaces:**
- Produces `observe`, `develop`, and `full` access profiles and `authorizeAgentAction(input)` returning `allowed`, `denied`, or `waiting_approval`.

- [ ] Write tests covering command, file read/write, secret read, Git, remote execution, and deployment capabilities; prove protected actions always wait and first connection has no implicit grant.
- [ ] Run focused tests and confirm failure because the policy/router do not exist.
- [ ] Implement policy evaluation, grant matching, approval creation, and agent-run pause/resume without weakening protected-action restrictions.
- [ ] Run focused tests and commit `feat: enforce agent access approvals`.

### Task 4: Agent orchestration and APIs

**Files:**
- Create: `src/lib/agents/service.ts`
- Create: `src/app/api/agents/providers/route.ts`
- Create: `src/app/api/agents/profiles/route.ts`
- Create: `src/app/api/agents/runs/route.ts`
- Create: `src/app/api/agents/runs/[id]/route.ts`
- Create: `src/app/api/agents/runs/[id]/messages/route.ts`
- Create: `src/app/api/agents/runs/[id]/interrupt/route.ts`
- Create: `src/app/api/agents/runs/[id]/resume/route.ts`
- Test: `tests/integration/agentRoutes.test.ts`

**Interfaces:**
- Consumes provider sessions, repository, vault references, and approval router.
- Produces metadata-only profile/run endpoints and desktop-host-required launch responses.

- [ ] Write route tests for profile creation, provider configuration references, launch, message append, interrupt, resume, transcript inspection, and browser-only launch refusal.
- [ ] Run focused tests and confirm missing routes/service failure.
- [ ] Implement orchestration and routes with bounded input, redacted output, explicit desktop capability checks, and execution events.
- [ ] Run focused tests and commit `feat: add agent orchestration APIs`.

### Task 5: Typed Electron provider bridge

**Files:**
- Create: `electron/agentRuntime.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/types/electron.d.ts`
- Test: `tests/unit/agentDesktopBridge.test.ts`

**Interfaces:**
- Produces typed `discover`, `launch`, `input`, `permissionDecision`, `interrupt`, `terminate`, and `onEvent` desktop operations.

- [ ] Write tests against an injected fake process proving IPC registration, stream forwarding, input validation, interruption, termination, and listener cleanup.
- [ ] Run focused tests and confirm missing bridge failure.
- [ ] Implement the desktop runtime and typed IPC/preload surface, restricting executable selection to the Codex/Claude adapters.
- [ ] Run focused tests plus Electron typecheck and commit `feat: bridge ACP providers through Electron`.

### Task 6: Workflow agent node

**Files:**
- Modify: `src/lib/workflows/adapters.ts`
- Modify: `src/lib/workflows/nodeExecutors.ts`
- Modify: `src/lib/workflows/runtimeAdapters.ts`
- Modify: `src/lib/workflows/schema.ts`
- Modify: `src/components/workflows/WorkflowInspector.tsx`
- Test: `tests/unit/workflowAgentNode.test.ts`
- Test: `tests/integration/workflowAgentNode.test.ts`

**Interfaces:**
- Adds `runAgent(config, input, signal)` and agent-node configuration for provider/profile, prompt template, structured input/output schemas, timeout, artifact capture, and approval pause/resume.

- [ ] Write failing unit/integration tests proving provider neutrality, prompt interpolation, structured output validation, timeout/cancellation, artifact capture, and approval waiting/resume.
- [ ] Run focused tests and confirm the existing Phase 6 unsupported-node error.
- [ ] Implement the adapter, executor, validation, persistence correlation, and inspector fields.
- [ ] Run focused and existing workflow tests and commit `feat: execute agents in workflows`.

### Task 7: Agents activity and permission UI

**Files:**
- Create: `src/features/agents/agentsSlice.ts`
- Create: `src/features/agents/selectors.ts`
- Create: `src/components/agents/AgentsView.tsx`
- Create: `src/components/agents/ProviderSetup.tsx`
- Create: `src/components/agents/AgentProfileEditor.tsx`
- Create: `src/components/agents/AgentTranscript.tsx`
- Create: `src/components/agents/AgentPermissions.tsx`
- Modify: `src/components/workbench/ActivityBar.tsx`
- Modify: `src/components/workbench/SidePanel.tsx`
- Modify: `src/components/workbench/WorkbenchShell.tsx`
- Modify: `src/store/store.ts`
- Test: `tests/unit/agentsSlice.test.ts`
- Test: `tests/unit/agentsView.test.tsx`

**Interfaces:**
- Produces the activity view, setup/profile/context controls, transcript/artifacts, interrupt/resume, first-connection access selection, scoped grants, and browser-only state.

- [ ] Write reducer/component tests for loading, selection, provider setup, access choice, transcript/artifacts, pending approval, interrupt/resume, and desktop-required rendering.
- [ ] Run focused tests and confirm missing feature/UI failure.
- [ ] Implement the Redux state and restrained workbench UI using existing primitives and approval inbox links.
- [ ] Run focused tests and application typecheck; commit `feat: add agents workbench`.

### Task 8: Acceptance, documentation, and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`
- Modify: `docs/superpowers/handoffs/2026-07-13-session-handoff.md`
- Create: `tests/integration/agentAcceptance.test.ts`

**Interfaces:**
- Proves the same workflow node runs through fake Codex and Claude adapters, requests the selected access level, pauses protected actions, and produces redacted auditable artifacts.

- [ ] Write the failing end-to-end acceptance test and run it to confirm missing integrated behavior.
- [ ] Complete only the integration glue needed for the acceptance test, then run it green.
- [ ] Update the roadmap checkboxes, feature inventory, security boundaries, provider setup notes, validation limits, and Phase 7 handoff.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npx tsc -p electron/tsconfig.json --noEmit`, `npm run build`, and `git diff --check` with the isolated database and required secrets.
- [ ] Review every Phase 6 roadmap requirement against code/tests and commit `feat: complete phase 6 ACP agents`.
