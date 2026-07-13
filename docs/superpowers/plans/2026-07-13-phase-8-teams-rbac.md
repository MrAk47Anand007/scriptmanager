# Phase 8 Teams, RBAC, and Workspace Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure optional multi-user workspaces with server-enforced resource/action authorization and agent authority that can never exceed its initiating user.

**Architecture:** Keep local single-user mode as an authenticated default administrator while introducing persisted users, workspaces, memberships, roles, permissions, invitations, and revocable sessions. Route handlers resolve one request context, services authorize explicit `resource:action` permissions within that workspace, and agent authorization intersects user RBAC, agent profile access, workspace policy, and protected-action approval.

**Tech Stack:** Next.js 15 route handlers, TypeScript, Prisma 6/SQLite, React 19, Vitest.

## Global Constraints

- Single-user local mode remains the default and receives a deterministic default workspace migration.
- Cross-workspace access is denied by default.
- Authorization is enforced in server services/routes, never only by hiding UI.
- Preset roles are owner, admin, developer, operator, approver, and viewer.
- Protected operations continue through the existing approval service.
- Tests are written and observed failing before production implementation.

---

### Task 1: Workspace identity schema and bootstrap

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713190000_phase8_teams_rbac/migration.sql`
- Create: `src/lib/rbac/catalog.ts`
- Create: `src/lib/rbac/bootstrap.ts`
- Test: `tests/integration/workspaceBootstrap.test.ts`

**Interfaces:**
- Produces: `ensureDefaultWorkspace(database): Promise<{ userId: string; workspaceId: string }>` and canonical permission/role preset constants.

- [ ] Write an integration test proving bootstrap creates one administrator, default workspace, owner membership, six immutable preset roles, and is idempotent.
- [ ] Run `npx vitest run tests/integration/workspaceBootstrap.test.ts` and verify the missing models/bootstrap fail.
- [ ] Add `User`, `Workspace`, `Membership`, `Role`, `RolePermission`, `WorkspaceInvitation`, and `UserSession`; add `workspaceId` ownership to core resource roots and audit records without making existing rows unusable.
- [ ] Add SQL that creates RBAC tables, inserts the deterministic default workspace/admin/presets, and assigns existing data to the default workspace.
- [ ] Implement the runtime idempotent bootstrap and run the focused test to green.

### Task 2: Request identity, sessions, and authorization service

**Files:**
- Modify: `src/lib/auth.ts`, `src/lib/session.ts`, `src/middleware.ts`
- Create: `src/lib/rbac/types.ts`, `src/lib/rbac/authorization.ts`, `src/lib/rbac/requestContext.ts`
- Test: `tests/unit/authorizationMatrix.test.ts`, `tests/integration/sessionContext.test.ts`

**Interfaces:**
- Produces: `authorize(context, resource, action, resourceWorkspaceId?)`, `requireAuthorization(...)`, and `resolveRequestContext(request)`.

- [ ] Write matrix tests for owner/admin/developer/operator/approver/viewer across scripts, workflows, secrets, agents, approvals, Ops, Git, members, roles, sessions, and audit.
- [ ] Write session tests for valid, expired, revoked, and cross-workspace contexts; run them and observe failure.
- [ ] Extend signed session payloads with session/user/workspace IDs and persist only hashed session tokens.
- [ ] Implement explicit deny-by-default permission evaluation, owner invariants, resource-workspace checks, and request context resolution with local bootstrap compatibility.
- [ ] Run both focused suites to green.

### Task 3: Server-side resource authorization and agent intersection

**Files:**
- Modify: route handlers under `src/app/api/scripts`, `workflows`, `secrets`, `agents`, `approvals`, `ops`, and `projects/[id]/git`
- Modify: `src/lib/agents/accessPolicy.ts`, `src/lib/agents/approvalRouter.ts`, `src/lib/workflows/worker.ts`
- Create: `src/lib/rbac/agentAuthority.ts`
- Test: `tests/integration/rbacRoutes.test.ts`, `tests/integration/agentAuthority.test.ts`

**Interfaces:**
- Consumes: request context and authorization service from Task 2.
- Produces: common 401/403 behavior and `authorizeAgentAuthority(...)` intersection decisions.

- [ ] Write route tests proving unauthenticated, insufficient-role, and cross-workspace calls fail while valid calls succeed.
- [ ] Write agent tests proving the effective permission is the intersection of initiating membership, agent profile, workspace policy, and protected-action approval; observe failures.
- [ ] Replace hard-coded `current-user`/`default` request actors in protected routes with resolved context and authorization checks.
- [ ] Enforce the agent intersection before consulting reusable approval grants, preserving always-approval protected actions.
- [ ] Run both focused suites and existing secret/agent/Git/workflow suites to green.

### Task 4: Team administration APIs and grant revocation

**Files:**
- Create: `src/lib/rbac/adminService.ts`
- Create: route handlers under `src/app/api/workspaces/current/{users,roles,memberships,invitations,sessions,audit}`
- Create: `src/app/api/workspaces/current/grants/revoke/route.ts`
- Test: `tests/integration/teamAdminRoutes.test.ts`

**Interfaces:**
- Produces: list/invite/update/revoke operations scoped to the current workspace with owner-last-admin safeguards.

- [ ] Write failing tests for invitations, membership role changes, custom role permission edits, session revocation, approval/agent grant revocation, audit listing, and last-owner protection.
- [ ] Implement transactional admin operations with audit events and normalized 400/403/404/409 responses.
- [ ] Run the focused suite to green.

### Task 5: Teams, roles, sessions, revocations, and audit UI

**Files:**
- Create: `src/components/settings/TeamsSection.tsx`, `RolesSection.tsx`, `SessionsSection.tsx`, `WorkspaceAuditSection.tsx`
- Modify: `src/components/settings/SettingsLayout.tsx`
- Test: `tests/unit/workspaceAdminUi.test.tsx`

**Interfaces:**
- Consumes: Task 4 JSON APIs.
- Produces: settings screens for membership/invitations, roles/permissions, active sessions/grants, and audit history.

- [ ] Write failing component tests for role-aware visibility, invite flow, role editing, session/grant revocation, and audit rendering.
- [ ] Implement accessible tables/forms with loading, empty, permission-denied, validation, and destructive-action confirmation states.
- [ ] Run the focused UI suite to green.

### Task 6: Phase exit verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`, `README.md`
- Create: `docs/superpowers/handoffs/2026-07-13-phase-8-teams-rbac.md`

- [ ] Apply the Phase 8 migration to a clean temporary SQLite database and run all focused tests.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] Record code-complete, test-complete, and manual multi-user validation status separately; mark Phase 8 roadmap items only when evidence supports them.
- [ ] Commit intentional Phase 8 files on `codex/phase-8-teams-rbac`.
