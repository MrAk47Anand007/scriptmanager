# Phase 7 Git-Backed Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ScriptManager projects repository-aware so users and approved agents can inspect and mutate Git repositories without bypassing workspace policy.

**Architecture:** Extend the existing `Project`, `Workflow`, and `AgentProfile` records with repository/workspace bindings. A focused server-side Git service resolves and validates repository roots, runs `git` with `spawn(executable, args)` only, classifies protected operations, routes them through the Phase 4 approval service, and emits Phase 1 execution events. Thin route handlers expose the service to a restrained source-control workbench embedded in the existing application shell.

**Tech Stack:** Next.js 15 route handlers, React 19, Redux Toolkit, Prisma/SQLite, Node.js `child_process.spawn`, Vitest, Tailwind CSS.

## Global Constraints

- Repository commands must use an executable plus argument array; never concatenate user input into a shell command.
- Every resolved repository path must remain within the project's granted repository root.
- Push, force operations, destructive cleanup, and writes outside granted roots always require approval.
- Human and agent Git actions must emit redacted unified execution events.
- Browser-only mode may use the server Git service only for server-accessible repository roots; no silent desktop capability fallback.
- Preserve the existing workbench visual language: dense, cardless, one accent color, clear status and action hierarchy.

---

### Task 1: Repository metadata and workspace policy

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713170000_phase7_git_projects/migration.sql`
- Create: `src/lib/git/types.ts`
- Create: `src/lib/git/policy.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`
- Test: `tests/unit/gitPolicy.test.ts`
- Test: `tests/integration/projectRepositoryRoutes.test.ts`

**Interfaces:**
- Produces: `RepositoryWorkspace`, `WorkspacePolicy`, `resolveRepositoryPath(root, requestedPath)`, and project JSON fields `repository_root`, `default_branch`, `remote_url`, `workspace_policy`.
- Consumes: existing Prisma `Project` CRUD and route response conventions.

- [ ] Write policy tests proving an in-root path is accepted, traversal/outside paths are rejected, and protected operations are classified.
- [ ] Run `npx vitest run tests/unit/gitPolicy.test.ts` and confirm the new module import fails.
- [ ] Add repository fields and migration SQL, implement normalized path containment and policy parsing, and expose validated fields through project create/update routes.
- [ ] Run the policy and project-route tests and confirm they pass.

### Task 2: Argument-safe Git service with audit and approval

**Files:**
- Create: `src/lib/git/process.ts`
- Create: `src/lib/git/parser.ts`
- Create: `src/lib/git/service.ts`
- Create: `src/app/api/projects/[id]/git/route.ts`
- Test: `tests/unit/gitParser.test.ts`
- Test: `tests/unit/gitService.test.ts`
- Test: `tests/integration/gitRoutes.test.ts`

**Interfaces:**
- Consumes: `RepositoryWorkspace`, Phase 4 `createApprovalService`, and Phase 1 `createExecutionEventRepository`.
- Produces: `GitService.status`, `diff`, `branches`, `checkout`, `commit`, `fetch`, `pull`, `push`; `POST /api/projects/:id/git` accepts a discriminated action payload and returns either a result or `202 { approval }`.

- [ ] Write parser tests for porcelain-v2 status, branch listings, remote metadata, and unified diff file sections.
- [ ] Run parser tests and confirm failures before implementation.
- [ ] Implement parsers and an injectable `GitProcessRunner` that calls `spawn('git', args, { cwd, shell: false })`, captures bounded output, and rejects non-zero exits with sanitized errors.
- [ ] Write service tests with a fake runner proving exact argument arrays, policy denial, audit emission, and approval pauses for protected operations.
- [ ] Run service tests and confirm failures before service implementation.
- [ ] Implement the service and thin route, then run parser, service, and route tests.

### Task 3: Workflow and agent repository selection

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260713170000_phase7_git_projects/migration.sql`
- Modify: `src/lib/workflows/types.ts`
- Modify: `src/lib/workflows/schema.ts`
- Modify: `src/lib/workflows/repository.ts`
- Modify: `src/lib/agents/repository.ts`
- Modify: `src/app/api/agents/profiles/route.ts`
- Modify: `src/components/workflows/WorkflowInspector.tsx`
- Modify: `src/components/agents/AgentProfileEditor.tsx`
- Test: `tests/unit/workflowRepositoryWorkspace.test.ts`
- Test: `tests/integration/agentRepositoryWorkspace.test.ts`

**Interfaces:**
- Produces: optional `projectId` on workflows and agent profiles; runtime workspace resolution always derives the root from the selected Project rather than accepting arbitrary client paths.
- Consumes: project repository metadata and existing workflow/agent profile APIs.

- [ ] Write failing tests for persisted project selection and rejection of projects without repository roots.
- [ ] Add nullable project relations, API serialization, and repository selectors.
- [ ] Add compact project selectors to workflow and agent inspectors.
- [ ] Run focused workflow and agent tests.

### Task 4: Source-control workbench

**Files:**
- Create: `src/features/git/gitSlice.ts`
- Create: `src/features/git/selectors.ts`
- Create: `src/components/git/SourceControlSidebar.tsx`
- Create: `src/components/git/SourceControlWorkbench.tsx`
- Create: `src/components/git/DiffViewer.tsx`
- Create: `src/components/git/CommitForm.tsx`
- Modify: `src/store/store.ts`
- Modify: `src/components/ActivityBar.tsx`
- Modify: `src/components/WorkbenchShell.tsx`
- Test: `tests/unit/gitSlice.test.ts`
- Test: `tests/unit/sourceControlView.test.tsx`

**Interfaces:**
- Consumes: project list plus `/api/projects/:id/git` status/diff/branch/action responses.
- Produces: project picker, staged/unstaged/untracked groups, branch picker, diff viewer, commit form, refresh/fetch/pull/push actions, conflict state, approval-pending state, and actionable errors.

- [ ] Write reducer tests for project selection, refresh results, operation pending/error state, and approval-pending responses.
- [ ] Run reducer tests and confirm failure before adding the slice.
- [ ] Implement the slice and register it in the store.
- [ ] Build a cardless sidebar and diff-first main surface using existing workbench tokens; show conflicts before routine changes and disable unsafe actions while operations are pending.
- [ ] Add component tests for empty repository, conflict, selected diff, commit, and approval-pending states.
- [ ] Run focused UI tests and repair accessibility/type issues.

### Task 5: Phase exit verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`
- Create: `docs/superpowers/handoffs/2026-07-13-phase-7-git-backed-projects.md`

**Interfaces:**
- Produces: reproducible Phase 7 verification evidence and explicit Phase 8 starting point.

- [ ] Run `npx prisma generate`.
- [ ] Run all Phase 7 focused tests against the initialized temporary SQLite database.
- [ ] Run `npm test -- --run` and require all suites to pass.
- [ ] Run `npm run build` and require Prisma generation plus Next.js production build to pass.
- [ ] Review `git diff --check`, changed-file scope, protected operation coverage, and route authorization boundaries.
- [ ] Update the roadmap checkboxes and write the handoff with code-complete, test-complete, and any desktop/manual validation status separated.
