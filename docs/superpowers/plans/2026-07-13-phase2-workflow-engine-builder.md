# Phase 2 Workflow Engine and Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build versioned, validated workflows that execute existing ScriptManager script, API, remote, condition, approval, and parallel capabilities with durable node state.

**Architecture:** Prisma stores workflow drafts, immutable published versions, triggers, runs, and node attempts. Focused modules under `src/lib/workflows/` validate and plan DAGs, resolve mappings, and execute nodes through injected adapters; route handlers and Redux/UI consume those contracts. A database worker claims queued runs atomically and reconciles interrupted work on startup.

**Tech Stack:** Next.js 15, React 19, TypeScript, Redux Toolkit, Prisma 6/SQLite, Vitest, Croner.

**Implementation status (2026-07-13):** Complete. Tasks 1-8 are implemented and verified on `codex/phase-2-workflow-engine`.

## Global Constraints

- Preserve all existing script, API, Ops, cloud-storage, CLI, web, and Electron behavior.
- Workflow definitions are schema-versioned and acyclic in version one.
- Agent nodes are schema-valid but remain non-executable until Phase 6.
- Never persist plaintext secrets in workflow definitions, node inputs, logs, Redux, or API responses.
- Every backend behavior follows red-green TDD and Phase 2 ends with `npm test` and `npm run build` passing.

---

### Task 1: Workflow contracts and graph planning

**Files:**
- Create: `src/lib/workflows/types.ts`
- Create: `src/lib/workflows/schema.ts`
- Create: `src/lib/workflows/graph.ts`
- Test: `tests/unit/workflowSchema.test.ts`
- Test: `tests/unit/workflowGraph.test.ts`

**Interfaces:**
- Produces: `parseWorkflowDefinition(input): WorkflowDefinition`, `validateWorkflowGraph(definition): ValidationIssue[]`, and `planWorkflow(definition): string[][]`.

- [ ] Write tests for every supported node discriminator, invalid configs, duplicate/missing nodes, invalid ports, cycles, and deterministic parallel topological layers.
- [ ] Run focused tests and confirm failures are caused by missing workflow modules.
- [ ] Implement discriminated TypeScript contracts, strict runtime parsing, DAG validation, and deterministic planning.
- [ ] Run focused and full unit suites; refactor only while green.
- [ ] Commit contracts and graph planner.

### Task 2: Variable mappings and execution policy

**Files:**
- Create: `src/lib/workflows/mappings.ts`
- Create: `src/lib/workflows/policy.ts`
- Test: `tests/unit/workflowMappings.test.ts`
- Test: `tests/unit/workflowPolicy.test.ts`

**Interfaces:**
- Produces: `resolveMappings(mappings, context)`, `calculateRetryDelay(policy, attempt)`, and `nextFailureAction(policy, attempt)`.

- [ ] Write failing tests for trigger/workflow/node-output paths, missing values, secret-reference preservation, retry limits, timeout defaults, and stop/continue/fallback policies.
- [ ] Run tests and verify expected red failures.
- [ ] Implement pure mapping and policy helpers without evaluating arbitrary JavaScript.
- [ ] Run focused and full unit suites.
- [ ] Commit mappings and policies.

### Task 3: Durable workflow persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713090000_add_workflows/migration.sql`
- Create: `src/lib/workflows/repository.ts`
- Test: `tests/integration/workflowRepository.test.ts`

**Interfaces:**
- Produces repository methods for draft CRUD, publish, enqueue, atomic claim, node-attempt transitions, cancellation, approval resume, retry-node, and restart reconciliation.

- [ ] Write integration tests against a temporary SQLite schema for immutable published versions and valid run/node transitions.
- [ ] Run tests and confirm missing models/repository failures.
- [ ] Add workflow models, indexes, relations, migration, and repository methods using transactions for claims and transitions.
- [ ] Generate Prisma client, push the temporary schema, and run integration tests.
- [ ] Commit persistence.

### Task 4: Node adapters and worker

**Files:**
- Create: `src/lib/workflows/adapters.ts`
- Create: `src/lib/workflows/nodeExecutors.ts`
- Create: `src/lib/workflows/worker.ts`
- Test: `tests/unit/workflowNodeExecutors.test.ts`
- Test: `tests/integration/workflowWorker.test.ts`

**Interfaces:**
- Consumes: graph plan, mapping context, repository transitions.
- Produces: `WorkflowAdapters`, `executeWorkflowNode`, and `runClaimedWorkflow`.

- [ ] Write failing tests for script, API, remote, condition, transform, delay, approval, parallel/join, notification placeholder, unsupported agent execution, retry, timeout, cancellation, and restart handling.
- [ ] Implement injected adapters around existing ScriptManager runtimes and pure built-in node executors.
- [ ] Implement worker orchestration with persisted before/after attempt transitions and bounded retry scheduling.
- [ ] Run focused tests and the full suite.
- [ ] Commit worker runtime.

### Task 5: Manual, cron, and signed-webhook triggers

**Files:**
- Create: `src/lib/workflows/triggers.ts`
- Create: `src/app/api/workflow-webhooks/[token]/route.ts`
- Modify: `src/lib/schedulerService.ts`
- Test: `tests/unit/workflowTriggers.test.ts`

**Interfaces:**
- Produces signature verification, idempotency-key derivation, cron registration, and queued-run creation.

- [ ] Write failing tests for valid/invalid signatures, replay deduplication, cron enablement, and manual actor metadata.
- [ ] Implement trigger services with timing-safe signature comparison and unique idempotency constraints.
- [ ] Run focused and full suites.
- [ ] Commit triggers.

### Task 6: Workflow HTTP API

**Files:**
- Create: `src/app/api/workflows/route.ts`
- Create: `src/app/api/workflows/[id]/route.ts`
- Create: `src/app/api/workflows/[id]/validate/route.ts`
- Create: `src/app/api/workflows/[id]/publish/route.ts`
- Create: `src/app/api/workflows/[id]/runs/route.ts`
- Create: `src/app/api/workflow-runs/[id]/route.ts`
- Create: `src/app/api/workflow-runs/[id]/cancel/route.ts`
- Create: `src/app/api/workflow-runs/[id]/retry-node/route.ts`
- Create: `src/app/api/workflow-runs/[id]/events/route.ts`
- Test: `tests/integration/workflowRoutes.test.ts`

**Interfaces:**
- Produces JSON CRUD, validation, publish, run, cancel, retry-node, run-detail, and SSE event endpoints.

- [ ] Write failing route tests for success, validation, conflicts, missing resources, and invalid transitions.
- [ ] Implement thin authenticated route handlers over workflow services.
- [ ] Run route tests and the full suite.
- [ ] Commit API routes.

### Task 7: Redux state and visual builder

**Files:**
- Create: `src/features/workflows/workflowsSlice.ts`
- Create: `src/features/workflows/selectors.ts`
- Create: `src/components/workflows/WorkflowBuilder.tsx`
- Create: `src/components/workflows/WorkflowCanvas.tsx`
- Create: `src/components/workflows/WorkflowPalette.tsx`
- Create: `src/components/workflows/WorkflowInspector.tsx`
- Create: `src/components/workflows/WorkflowRunPanel.tsx`
- Modify: `src/components/workbench/ActivityBar.tsx`
- Modify: `src/components/workbench/SidePanel.tsx`
- Modify: `src/store/store.ts`
- Test: `tests/unit/workflowsSlice.test.ts`

**Interfaces:**
- Consumes workflow API contracts; produces draft editing, connections, validation display, publish, run, cancel, and live run state.

- [ ] Write reducer tests for load, edit, connect, validation, publish, and run event transitions.
- [ ] Implement normalized Redux state and typed async actions.
- [ ] Build keyboard-accessible palette/canvas/inspector using existing design tokens and native pointer interactions.
- [ ] Add Workflow activity navigation and run controls.
- [ ] Run tests, TypeScript checks, and build.
- [ ] Commit builder UI.

### Task 8: Templates and acceptance verification

**Files:**
- Create: `src/lib/workflows/templates.ts`
- Create: `tests/integration/workflowAcceptance.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-13-phase2-workflow-engine-builder.md`

**Interfaces:**
- Produces script pipeline, API-to-script, approval deploy, and remote maintenance templates.

- [ ] Write failing tests proving templates parse and the acceptance workflow persists script, API, condition, approval, and parallel node state.
- [ ] Implement templates and seed/list integration.
- [ ] Run fresh schema generation, all tests, TypeScript checks, Electron checks, and production build.
- [ ] Update README and mark plan checkboxes from evidence only.
- [ ] Commit Phase 2 completion documentation.

## Verification evidence

- Workflow schemas, graph planning, mappings, policies, persistence, worker execution, triggers, HTTP routes, Redux state, templates, and acceptance contracts are covered by Vitest.
- `npm test` passes against a freshly synchronized SQLite schema.
- `npm run build` completes with every workflow route included in the Next.js route manifest.
- `npx tsc -p electron/tsconfig.json --noEmit` passes.
