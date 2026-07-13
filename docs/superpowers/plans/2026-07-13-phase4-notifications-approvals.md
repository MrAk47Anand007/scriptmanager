# Phase 4 Notifications and Approval Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable event-driven notifications and a single auditable inbox for workflow, remote-operation, and future agent approvals.

**Architecture:** Prisma stores channels, rules, deliveries, approval requests, decisions, and scoped grants. A focused notification dispatcher matches typed events, renders bounded templates, deduplicates/throttles deliveries, and invokes provider-neutral adapters. A focused approval service owns request creation, expiry, decision validation, grant scope, audit events, and workflow resume; routes and the workbench UI remain thin consumers.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6/SQLite, Vitest, Electron typed IPC, native `fetch`, `node:net`, and `node:tls`.

## Global Constraints

- Preserve Phase 1 execution-event and Phase 2 workflow runtime contracts.
- Decisions are exactly `allow_once`, `allow_run`, `allow_workspace`, or `reject`.
- Persistent grants are scoped by actor/provider, workspace, capability, resource, and policy version.
- Protected actions cannot be silently approved by a notification channel or expired grant.
- Notification payloads and persisted delivery records must be redacted and bounded.
- Follow red-green TDD and finish with tests, application/electron typechecks, production build, and diff hygiene.

---

### Task 1: Durable notification and approval data

**Files:** Modify `prisma/schema.prisma`; create `prisma/migrations/20260713123000_phase4_notifications_approvals/migration.sql`; create `src/lib/approvals/types.ts`; create `src/lib/notifications/types.ts`; test `tests/unit/approvalPolicy.test.ts`.

- [ ] Write failing policy tests for the four decisions, expiry, protected actions, and workspace grant matching.
- [ ] Add normalized contracts plus Prisma models and indexes.
- [ ] Generate Prisma and run focused tests.

### Task 2: Approval service and workflow integration

**Files:** Create `src/lib/approvals/service.ts`; modify `src/lib/workflows/worker.ts`; modify `src/lib/workflows/repository.ts`; test `tests/integration/approvalService.test.ts`.

- [ ] Write failing integration coverage for request creation, expiry, reject, allow-once, run/workspace grants, immutable decision history, execution events, and workflow resume.
- [ ] Implement the service transaction boundaries and replace the workflow-only approval mutation with the shared service.
- [ ] Run focused and full tests.

### Task 3: Notification matching, adapters, and audited delivery

**Files:** Create `src/lib/notifications/matcher.ts`, `template.ts`, `adapters.ts`, and `dispatcher.ts`; test `tests/unit/notificationMatcher.test.ts` and `tests/integration/notificationDispatcher.test.ts`.

- [ ] Write failing tests for event matching, templates, secret redaction, throttle/deduplication, bounded retries, and Slack/Teams/generic webhook payloads.
- [ ] Implement desktop, generic webhook, Slack, Teams, and SMTP adapter contracts with injectable transports.
- [ ] Persist every attempt and terminal delivery outcome.

### Task 4: Routes and workbench UI

**Files:** Create routes under `src/app/api/approvals/**` and `src/app/api/notifications/**`; create `src/components/approvals/ApprovalInbox.tsx` and `src/components/settings/NotificationsSection.tsx`; modify workbench activity/page/settings integration; test `tests/integration/approvalRoutes.test.ts`.

- [ ] Add authenticated list/detail/decision routes and channel/rule/history/test routes.
- [ ] Build inbox risk/operation/resource/expiry/history views with all four decisions.
- [ ] Build channel and rule management plus delivery history and test controls.

### Task 5: Native notification deep links, documentation, and verification

**Files:** Modify `electron/main.ts`, `electron/preload.ts`, Electron API types, `README.md`, and `docs/superpowers/handoffs/2026-07-13-session-handoff.md`.

- [ ] Add typed native notification IPC with safe internal deep-link navigation.
- [ ] Document configuration, scoping, audit behavior, and exact verification evidence.
- [ ] Run `npm test`, `npx tsc --noEmit`, Electron typecheck, `npm run build`, and `git diff --check`.

## Acceptance Gate

- Failures and approval requests reach matching configured channels with audited delivery attempts.
- Operators can inspect exact redacted operations and decide with all four scoped outcomes.
- Expired requests and mismatched grants never authorize work.
- Workflow approval nodes resume through the shared approval service.
- Automated verification passes from the isolated Phase 4 branch.
