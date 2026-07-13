# Phase 3 Execution Dashboard and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators one dashboard for finding, diagnosing, cancelling, and safely retrying workflow, script, API, and remote executions.

**Architecture:** A focused `src/lib/observability/` service normalizes existing execution records without replacing their source-of-truth tables. It aggregates metrics and builds redacted run-detail timelines from `ExecutionEvent`, `WorkflowRun`, and `WorkflowNodeRun`; Next.js routes expose those contracts, and a lazily mounted React dashboard consumes them. Retention cleanup deletes only records older than configured cutoffs and never mutates active business state.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6/SQLite, Vitest, existing workbench components and Tailwind tokens.

**Implementation status (2026-07-13):** Complete and automatically verified on `codex/phase-3-execution-observability`. Manual Electron visual QA remains pending.

## Global Constraints

- Preserve Phase 1 execution-event and Phase 2 workflow runtime contracts.
- Never return unredacted persisted inputs, outputs, errors, logs, or artifacts.
- Retry a failed workflow node through the existing targeted retry contract; never replay completed nodes.
- Keep dashboard queries bounded and filterable by type, workflow, script, status, trigger, actor, provider, project, and time range.
- Follow red-green TDD for backend behavior and finish with unit tests, integration tests, production build, Electron typecheck, and diff hygiene.

---

### Task 1: Observability contracts, filters, and normalization

**Files:**
- Create: `src/lib/observability/types.ts`
- Create: `src/lib/observability/filters.ts`
- Test: `tests/unit/observabilityFilters.test.ts`

**Interfaces:**
- Produces: `parseExecutionFilters(searchParams): ExecutionFilters`, `normalizeStatus(status): ExecutionStatus`, and bounded `limit`/time-range rules.

- [ ] Write failing tests for supported filters, invalid dates, status aliases, and limit clamping.
- [ ] Run `npm test -- tests/unit/observabilityFilters.test.ts` and confirm the module-missing red state.
- [ ] Implement strict parsing and normalization with no database dependency.
- [ ] Run focused and full tests.
- [ ] Commit contracts and filters.

### Task 2: Aggregated metrics and unified run detail

**Files:**
- Create: `src/lib/observability/repository.ts`
- Test: `tests/integration/observabilityRepository.test.ts`

**Interfaces:**
- Consumes: Prisma execution events, workflow runs/node runs, builds, API collection runs, remote executions, scripts, workflows, and workflow triggers.
- Produces: `getDashboard(filters)`, `listRuns(filters)`, `getRunDetail(kind, id)`, and `downloadRedactedLog(kind, id)`.

- [ ] Seed a failing integration test covering active/success/failure/timeout/retry counts, duration, schedule health, filters, redacted timeline data, node attempts, actor, and correlation ID.
- [ ] Run the focused integration test and verify the missing repository failure.
- [ ] Implement bounded aggregate and detail queries, normalizing source-specific statuses into the shared contract.
- [ ] Verify secrets in event data, node input/output/error, and remote logs are redacted before return.
- [ ] Run focused and full tests, then commit.

### Task 3: Observability HTTP API and actions

**Files:**
- Create: `src/app/api/observability/dashboard/route.ts`
- Create: `src/app/api/observability/runs/route.ts`
- Create: `src/app/api/observability/runs/[kind]/[id]/route.ts`
- Create: `src/app/api/observability/runs/[kind]/[id]/log/route.ts`
- Create: `src/app/api/observability/runs/[kind]/[id]/cancel/route.ts`
- Create: `src/app/api/observability/runs/[kind]/[id]/retry/route.ts`
- Test: `tests/integration/observabilityRoutes.test.ts`

**Interfaces:**
- Produces: authenticated JSON dashboard/list/detail/action routes and a redacted text-log download.

- [ ] Write failing route tests for filters, unknown runs, cancellation, whole-run retry eligibility, targeted-node retry delegation, and content-disposition on redacted logs.
- [ ] Implement thin routes over the observability and workflow repositories.
- [ ] Reject unsupported actions with `409`, unknown resources with `404`, and malformed filters with `400`.
- [ ] Run focused and full tests, then commit.

### Task 4: Dashboard workbench UI

**Files:**
- Create: `src/components/observability/ExecutionDashboard.tsx`
- Create: `src/components/observability/RunDetail.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/workbench/ActivityBar.tsx`
- Modify: `src/features/workbench/workbenchSlice.ts`

**Interfaces:**
- Consumes: Phase 3 dashboard, run-list, detail, cancel, retry, retry-node, and log routes.
- Produces: dashboard summary, active runs, failure trend, schedule health, recent events, filters, detail timeline, node attempts, and operator actions.

- [ ] Add the `executions` activity and lazy dashboard mount.
- [ ] Build accessible loading, empty, error, and selected-run states using existing workbench tokens.
- [ ] Add filter controls and refresh after cancel/retry actions.
- [ ] Show timeline provenance and correlation IDs without rendering raw JSON secrets.
- [ ] Run TypeScript, unit/integration tests, and production build; commit UI.

### Task 5: Retention cleanup and phase handoff

**Files:**
- Create: `src/lib/observability/retention.ts`
- Create: `src/app/api/observability/retention/route.ts`
- Test: `tests/integration/observabilityRetention.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/handoffs/2026-07-13-session-handoff.md`

**Interfaces:**
- Produces: `cleanupObservabilityData({ eventDays, terminalRunDays, now })` and a settings-backed cleanup route.

- [ ] Write a failing integration test proving expired events and terminal workflow runs are deleted while active/recent records remain.
- [ ] Implement clamped retention windows and transactional cleanup.
- [ ] Document dashboard behavior, filters, retry safety, and retention defaults.
- [ ] Run `npm test`, `npm run build`, `npx tsc -p electron/tsconfig.json --noEmit`, and `git diff --check` with a usable isolated database.
- [ ] Update the handoff with exact evidence and commit Phase 3 completion.

## Acceptance Gate

- An operator can filter all execution types, see active/failure/schedule signals, open a redacted causal timeline, identify the failed workflow node and its provenance, and retry only that failed node without replaying completed non-idempotent nodes.
- Retention cleanup preserves active and recent records.
- All automated verification commands pass from a clean Phase 3 branch.
