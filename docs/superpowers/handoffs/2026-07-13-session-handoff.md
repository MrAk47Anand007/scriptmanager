# ScriptManager Session Handoff — 2026-07-13

## Truth source

- Repository: `scriptmanager`
- Active worktree: `.worktrees/p8`
- Active branch: `codex/phase-8-teams-rbac`
- Base commit on `main`: `b204cda`
- Phase 8 base commit: `5d54d48` (`feat: add phase 7 git-backed projects`)
- Phase 8 implementation head: `8d78ad9` (`feat: add phase 8 teams and workspace RBAC`)
- Working-tree state at Phase 8 completion: clean after the final build, test, and diff-hygiene pass; this session-handoff update is the only subsequent intentional documentation change.
- Integration state: Phases 1–8 are preserved in sequential local feature-branch ancestry. Phase 8 is committed locally but not merged, pushed, or opened as a pull request.

Use `.worktrees/p8` as the source of truth for Phases 1–8 and as the baseline for Phase 9 planning. The root `main` checkout does not contain these sequential phase branches and has unrelated local/divergent state that must not be overwritten.

## Completed phases

### Phase 1 — Quality and security foundation

Phase 1 is complete in the ancestry of this branch.

Key commits:

- `9c33439` — redacted execution event contracts
- `722c1ec` — durable execution-event persistence
- `dbeaa34` — failure-safe execution telemetry
- `aed9876` — script execution lifecycle recording
- `46998fd` — reliability foundation completion
- `e6b6501` — security coverage completion
- `a302249` — execution-event persistence verification in CI

Delivered capabilities include Vitest coverage, production secret validation, correlated/redacted execution events, structured execution telemetry, durable event persistence, and release-confidence fixes.

### Phase 2 — Workflow engine and visual builder

Phase 2 is complete on `codex/phase-2-workflow-engine`.

Key commits:

- `f6a2c86` — workflow schemas, graph validation/planning, mappings, and execution policies
- `1bdc091` — versioned workflow persistence, immutable publishing, atomic run claims, node state, cancellation, reconciliation, and idempotency
- `453878a` — durable workflow worker and node executors
- `c86a881` — signed-webhook, manual, and cron trigger primitives
- `5b23cf8` — workflow APIs, production adapters, approval resume, visual builder, templates, route coverage, documentation, and final acceptance work

Delivered capabilities:

- Versioned acyclic workflow definitions with script, API, remote, condition, transform, delay, approval, parallel, join, notification, and reserved agent nodes.
- Strict runtime schema validation, deterministic topological planning, condition ports, safe variable mappings, prototype-traversal protection, and opaque secret references.
- Prisma models and migration for workflows, versions, triggers, runs, and node runs.
- Immutable published versions, database-backed queueing, atomic claims, persisted node attempts/outputs/errors, cancellation, retries, approval pauses, and restart reconciliation.
- Concrete runtime adapters for existing script, API, and remote-execution capabilities.
- Manual, cron, and HMAC-SHA256 signed-webhook triggers with encrypted webhook secrets and idempotency/replay protection.
- Workflow CRUD, validate, publish, run, detail, cancel, approve, retry-node, trigger-management, and event-stream routes.
- Redux workflow state integrated with the existing workbench.
- Workflow activity-bar entry, workflow sidebar, node palette, canvas, inspector, connections, validation feedback, and save/publish/run controls.
- Script pipeline, API-to-script, approval deploy, and remote maintenance templates.
- README workflow feature inventory and detailed implementation plan.

## Verification evidence

Final verification was run from commit-ready Phase 2 state with:

```powershell
$env:DATABASE_URL='file:./phase2-baseline.db'
$env:AUTH_SECRET='phase2-final-verification-secret'
$env:SESSION_SECRET='phase2-final-session-secret'
npm test
npm run build
npx tsc -p electron/tsconfig.json --noEmit
git diff --check
```

Results:

- Vitest: 22 test files passed, 70 tests passed, 0 failures.
- Next.js production build: passed; all workflow and workflow-run routes appeared in the route manifest.
- Electron TypeScript: passed with no errors.
- Diff hygiene: passed.
- Worktree after `5b23cf8`: clean.

The build emits Node's existing `DEP0169` warning for dependency usage of `url.parse()`. It does not fail the build and was not introduced as a Phase 2 functional blocker.

## Known environment issue

Prisma 6.19.2's Windows schema engine failed with only `Schema engine error` when asked to create a brand-new SQLite database file, both inside the OneDrive worktree and under `%LOCALAPPDATA%\Temp`. The already synchronized isolated database `phase2-baseline.db` works and all integration tests pass against it.

Do not treat a failed fresh-file `prisma db push` on this machine as proof that the Phase 2 migration is invalid. Before release or CI handoff, reproduce database creation outside this Windows/OneDrive environment or investigate the local Prisma engine/antivirus/file-lock interaction.

## Historical Phase 2 integration choices

The completed branch is intentionally preserved. No merge or remote mutation was performed.

Available next actions:

1. Merge `codex/phase-2-workflow-engine` into `main` locally, then rerun tests on the merged result.
2. Push the branch and open a pull request.
3. Keep the branch/worktree for additional review.

The root `main` checkout was previously ahead of and behind `origin/main`, so inspect and reconcile its state before choosing a local merge. Do not overwrite unrelated root or `.claude/worktrees` changes.

## Historical recommendation after Phase 2

Proceed to Phase 3: unified execution dashboard and observability.

Recommended first slice:

1. Re-read this handoff and `docs/superpowers/plans/2026-07-13-phase2-workflow-engine-builder.md` from the feature branch.
2. Confirm the chosen integration state and branch truth before planning.
3. Define aggregated queries for active/succeeded/failed/timed-out/retried workflow, script, API, and remote runs.
4. Build a unified run-detail contract around the existing execution-event and workflow-node-run records.
5. Add dashboard UI only after metrics and run-detail contracts have integration tests.

Phase 3 should deliver active-run visibility, failure trends, schedule health, redacted event timelines, node attempts, correlation IDs, cancellation, and targeted retry actions. Preserve the Phase 2 runtime contracts rather than duplicating execution-specific state in the dashboard.

## Historical Phase 3 starting files

- `docs/superpowers/handoffs/2026-07-13-session-handoff.md`
- `docs/superpowers/plans/2026-07-13-phase2-workflow-engine-builder.md`
- `src/lib/workflows/types.ts`
- `src/lib/workflows/repository.ts`
- `src/lib/workflows/worker.ts`
- `src/lib/workflows/runtimeAdapters.ts`
- `src/features/workflows/workflowsSlice.ts`
- `src/components/workflows/WorkflowBuilder.tsx`
- `prisma/schema.prisma`

## Historical completion status after Phase 2

- Phase 1 code complete: yes.
- Phase 1 automated verification complete: yes.
- Phase 2 code complete: yes.
- Phase 2 automated verification complete: yes.
- Phase 2 merged/pushed/PR created: no.
- Fresh SQLite creation verified on this Windows machine: no; blocked by the Prisma schema-engine environment issue described above.
- Manual visual QA of the workflow builder in a running Electron window: not recorded in this session.

## Phase 3 implementation — execution dashboard and observability

Phase 3 work continues on `codex/phase-3-execution-observability`, based directly on Phase 2 commit `6747193`.

Implemented scope:

- Unified filter and status contracts for workflow, script, API, and remote execution records.
- Aggregated active/success/failure/timeout/retry/duration metrics, failure trend, schedule health, and recent runs.
- Redacted workflow detail with node attempts, persisted execution events, actors, provenance, and correlation IDs.
- Dashboard, run-list, detail, redacted-log, workflow-cancel, and targeted failed-node retry routes.
- Workbench execution dashboard with filters, run inspection, cancel/retry actions, and redacted log download.
- Bounded execution-event retention cleanup; business-state run records are deliberately preserved.

Final verification from the completed Phase 3 state:

- Vitest: 25 test files passed, 75 tests passed, 0 failures.
- Application TypeScript: `npx tsc --noEmit` passed.
- Electron TypeScript: `npx tsc -p electron/tsconfig.json --noEmit` passed.
- Next.js production build: passed; all seven observability routes appeared in the route manifest.
- Diff hygiene: `git diff --check` passed (Git emitted line-ending conversion notices only).
- Route integration coverage proves dashboard aggregation, redaction across run/node/event values, and targeted retry preserving a completed node.

Known validation limit: manual visual QA of the execution dashboard in a running Electron window was not performed in this implementation session.

## Phase 4 implementation — notifications and approval inbox

Phase 4 work is on `codex/phase-4-notifications-approvals`, based directly on the verified Phase 3 commit `6d6cc3c`.

Implemented scope:

- Durable notification channels, rules, deliveries, approval requests, decisions, and scoped grants with migration coverage.
- Shared approval policy and service with expiry, protected-action restrictions, immutable decisions, execution-event audit, and workflow pause/resume integration.
- Exactly four decisions: `allow_once`, `allow_run`, `allow_workspace`, and `reject`; persistent grants retain actor, workspace, run, capability, resource, and policy-version scope.
- Event matching, bounded templates, redaction, throttling, event/rule deduplication, retry audit state, and provider-neutral adapters for desktop, generic webhook, Slack, SMTP, and Teams.
- Approval list/detail/decision APIs plus notification channel, rule, and delivery-history APIs.
- Workbench approval inbox with risk, actor, exact operation, affected resource, expiry, preview, history, and decision controls.
- Notification settings surface and typed Electron native-notification/deep-link bridge.
- Existing workflow approval endpoint now delegates to the shared approval service instead of bypassing its audit and scope rules.

Final verification evidence from the complete Phase 4 working tree:

- Vitest: 30 test files passed, 84 tests passed, 0 failures.
- Application TypeScript: `npx tsc --noEmit` passed.
- Electron TypeScript: `npx tsc -p electron/tsconfig.json --noEmit` passed.
- Next.js production build passed and included all approval and notification routes.
- Diff hygiene: `git diff --check` passed; Git emitted line-ending conversion notices only.

Known validation limits:

- Manual visual QA in a running Electron window is not recorded.
- Live delivery to external Slack, SMTP, Teams, and webhook endpoints is not recorded; adapters are covered through deterministic injected transports and delivery-audit integration tests.

## Current Phase 4 git and integration state

- Branch: `codex/phase-4-notifications-approvals`.
- Worktree: `.worktrees/phase-4-notifications-approvals`.
- Base: verified Phase 3 commit `6d6cc3c`.
- Phase 4 changes: implemented and automatically verified, but not committed.
- Merge, push, and pull request: not performed.
- Root `main` remains a separate checkout with previously observed unrelated state; do not merge or overwrite it without inspecting it again.

Before switching branches, removing this worktree, or starting Phase 5, first commit the intentional Phase 4 source, migration, tests, plan, README, and this handoff together.

## Historical completion status after Phase 4

- Phase 1 code and automated verification complete: yes.
- Phase 2 code and automated verification complete: yes.
- Phase 3 code and automated verification complete: yes.
- Phase 4 code complete: yes, in the current uncommitted working tree.
- Phase 4 automated verification complete: yes.
- Phase 4 manual Electron visual QA complete: no.
- Live Slack, SMTP, Teams, and generic webhook validation complete: no.
- Phase 4 committed, merged, pushed, or opened as a PR: no.
- Fresh SQLite creation verified on this Windows/OneDrive machine: no; the previously documented Prisma schema-engine environment limitation remains.

## Recommended next phase

After committing and preserving Phase 4, proceed to Phase 5: shared encrypted secret vault.

Recommended first slice:

1. Branch Phase 5 from the committed Phase 4 head, not from `main` or the Phase 3 commit.
2. Add `Secret`, `SecretVersion`, `SecretBinding`, and `SecretAccessEvent` models that persist ciphertext and metadata only.
3. Define a provider-neutral `SecretStore` interface with Electron OS-backed and server master-key implementations.
4. Add redaction regression tests before migrating script environment values, API credentials, SSH credentials, storage-provider credentials, workflow references, or future ACP configuration.
5. Preserve opaque secret references across workflow definitions, notification configuration, logs, Redux, API responses, and approval previews.

## Files to read first next session

- `docs/superpowers/handoffs/2026-07-13-session-handoff.md`
- `docs/superpowers/plans/2026-07-13-phase4-notifications-approvals.md`
- `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`
- `prisma/schema.prisma`
- `src/lib/approvals/service.ts`
- `src/lib/approvals/policy.ts`
- `src/lib/notifications/dispatcher.ts`
- `src/lib/notifications/adapters.ts`
- `src/lib/execution/eventRepository.ts`
- `src/lib/storageEncryption.ts`
- `electron/preload.ts`
- `src/types/electron.d.ts`

## Phase 6 implementation — ACP agents with Codex and Claude

Phase 6 work is on `codex/phase-6-acp-agents`, based directly on the committed Phase 5 handoff tip.

Implemented scope:

- Provider-neutral ACP contracts and replayable sessions with Codex and Claude provider identities.
- Allowlisted Electron provider discovery and lifecycle IPC for `codex-acp` and `claude-agent-acp`; renderer requests cannot inject arbitrary executables.
- Durable provider configurations, profiles, runs, redacted messages, artifacts, permission records, usage/cost metadata, and correlation IDs.
- Observe, Develop, and Full access profiles. Commands, writes, Git, secrets, remote actions, and deployment route through Phase 4 approvals; protected actions never consume workspace grants.
- Agent orchestration with launch, stream persistence, interrupt, resume, recoverable errors, and browser-only launch refusal.
- Agents workbench with first-connection access selection, provider/profile setup, context folder picker, activity history, transcript, artifacts, usage, interrupt/resume, and desktop-required guidance.
- Executable workflow `agent` nodes with provider/profile selection, prompt interpolation, structured input, timeout through the existing node policy, artifact output, and approval pause propagation.
- Fake-provider contract and acceptance coverage proving the same workflow node operates through Codex and Claude identities and pauses protected deployment requests.

Security boundaries:

- Provider credentials are opaque `secret://` vault references; agent-specific plaintext credential storage is rejected.
- Browser mode can inspect durable run history but cannot launch, interrupt, or resume a local provider.
- Provider processes run only in Electron and are restricted to the two allowlisted ACP adapter executable names.
- Transcripts, artifacts, run inputs/errors, approvals, and usage records use durable correlation and redaction paths.

Known live-validation limits:

- Automated tests use deterministic fake providers. A live installed `codex-acp` and `claude-agent-acp` round trip is not recorded on this machine.
- Manual visual QA of the Agents workbench in a running Electron window is not recorded.

Next phase after preserving the verified Phase 6 completion commit: Phase 7 Git-backed projects. Branch from the Phase 6 tip, not `main`, so repository actions inherit agent policy, approvals, vault references, and audit correlation.

## Phase 5 implementation — shared encrypted secret vault

Phase 5 work is on `codex/phase-5-secret-vault`, based directly on committed Phase 4 commit `87506bd`.

Implemented and verified in the current working tree:

- Durable `Secret`, `SecretVersion`, `SecretBinding`, and `SecretAccessEvent` models plus migration.
- Provider-neutral `SecretStore` contract with authenticated AES-256-GCM server storage and an Electron `safeStorage` adapter.
- Vault create, rotate, disable, bind, resolve, reveal-once, metadata list, and access-history operations.
- Workspace, capability, resource-binding, and disabled-state read checks with allowed and denied access audit events.
- Opaque object and string secret-reference contracts.
- Metadata-only vault APIs plus explicit rotate, disable, bind, reveal, and history endpoints.
- Settings Secret Vault surface showing scope, version, binding count, access count, rotation, and disable controls.
- Script environment secrets now persist as vault references and resolve only in ephemeral server/Electron runtime environment maps.
- Ops SSH passwords persist as resource-bound vault references in server and Electron flows; existing DPAPI/legacy encrypted records remain readable.
- Storage-provider secret fields persist as references inside encrypted configuration and resolve only when constructing a provider runtime.
- API bearer, basic, API-key, and OAuth credential fields persist as references and resolve only for saved-request execution in web and Electron runtimes.
- Script and workflow webhook signing values persist as references; newly generated values are returned once and runtime signature verification resolves them server-side.
- Notification webhook URLs, SMTP passwords, tokens, and API keys persist as references and resolve only during delivery.
- Regression coverage for non-deterministic ciphertext, tamper detection, production key validation, scoped access, rotation, disabled denial, API leakage, reference persistence, and execution-event redaction.

Fresh verification after the implementation:

- Vitest: 36 test files passed, 100 tests passed, 0 failures after all credential migrations.
- Application and Electron typechecks passed after all credential migrations.

Phase 5 completion status:

- Phase 5 code complete: yes.
- Phase 5 automated verification complete: yes.
- Phase 5 committed: foundation commit `3d446ca`; completion commit recorded in the current branch history.
- Phase 5 merged, pushed, or opened as a PR: no.
- Manual Electron visual QA and a live OS `safeStorage` round trip are not recorded.
- Existing DPAPI/legacy Ops values and legacy encrypted storage/workflow values remain readable; new writes and explicit updates use vault references.
- Fresh SQLite creation on this Windows/OneDrive machine remains subject to the previously documented Prisma schema-engine limitation.

Final Phase 5 completion gate:

- `npm test`: 36 test files passed, 100 tests passed, 0 failures.
- `npx tsc --noEmit`: passed.
- `npx tsc -p electron/tsconfig.json --noEmit`: passed.
- `npm run build`: passed; all vault and migrated integration routes appeared in the Next.js route manifest.
- `git diff --check`: passed with Windows line-ending conversion notices only.
- The build still emits the pre-existing dependency warning for Node `DEP0169` (`url.parse()`); it does not fail the build.

Next phase after preserving the verified completion commit:

1. Proceed to Phase 6 provider-neutral ACP agents with Codex and Claude.
2. Reuse vault references for provider credentials and agent tool inputs; never add an agent-specific plaintext secret store.
3. Route agent secret reads and protected actions through Phase 4 approvals and Phase 5 access auditing.

## Current Phase 5 git and integration state

- Branch: `codex/phase-5-secret-vault`.
- Worktree: `.worktrees/phase-5-secret-vault`.
- Base: committed Phase 4 head `87506bd`.
- Head: `0f6049f` (`feat: complete vault credential migrations`).
- Working tree: clean after fresh migration, test, typecheck, build, and diff-hygiene verification.
- Merge, push, and pull request: not performed.
- Phase 6 must branch from the current `codex/phase-5-secret-vault` tip so this handoff is included, not from `main` or an earlier phase branch.

## Phase 6 starting instructions

Create a dedicated `codex/phase-6-acp-agents` branch and `.worktrees/phase-6-acp-agents` worktree from the current `codex/phase-5-secret-vault` tip. Implement the provider-neutral ACP layer with Codex and Claude adapters while preserving the established security boundaries:

1. Reuse Phase 4 approvals for permission requests and every protected action, including under Full access.
2. Reuse Phase 5 vault references for provider credentials and agent tool inputs; plaintext may exist only ephemerally inside trusted runtime boundaries.
3. Keep provider processes desktop-hosted through typed Electron IPC; browser-only mode may inspect runs but cannot silently launch local providers.
4. Persist redacted transcripts, artifacts, permission decisions, and provider usage metadata with execution correlation IDs.
5. Add fake-provider contract tests before connecting real Codex or Claude processes.

Read these files first for Phase 6:

- `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`
- `docs/superpowers/plans/2026-07-13-phase5-secret-vault.md`
- `src/lib/approvals/service.ts`
- `src/lib/approvals/policy.ts`
- `src/lib/secrets/service.ts`
- `src/lib/secrets/references.ts`
- `src/lib/secrets/runtime.ts`
- `src/lib/workflows/types.ts`
- `src/lib/workflows/nodeExecutors.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/types/electron.d.ts`

## Phase 7 implementation — Git-backed projects

Phase 7 is complete in the ancestry of the active Phase 8 branch at commit `5d54d48`.

Delivered scope:

- Repository root, default branch, remote metadata, and workspace policy on projects.
- Argument-safe Git status, diff, branch, checkout, commit, fetch, pull, push, and cleanup operations using `spawn('git', args, { shell: false })`.
- Source-control workbench with project connection, conflict/status groups, diff inspection, commit, branch context, and remote actions.
- Repository selection for workflows and agent profiles; ACP providers launch at the selected repository root.
- Phase 4 approval routing for push, force operations, and cleanup, with unified audit events for human and agent Git actions.

Phase 7 verification evidence:

- Vitest: 48 test files passed, 121 tests passed, 0 failures.
- `npm run build`: passed, including Prisma generation, TypeScript, Next.js compilation, and route generation.
- `git diff --check`: passed.
- Manual desktop validation remains pending for a real multi-file diff, disposable-branch commit, and approved push.

Detailed handoff: `docs/superpowers/handoffs/2026-07-13-phase-7-git-backed-projects.md`.

## Phase 8 implementation — teams, RBAC, and workspace policy

Phase 8 is complete and committed on `codex/phase-8-teams-rbac` at `8d78ad9`, based directly on the verified Phase 7 tip.

Delivered scope:

- Persisted `User`, `Workspace`, `Membership`, `Role`, `RolePermission`, `WorkspaceInvitation`, and `UserSession` models.
- Deterministic, idempotent local bootstrap with a default administrator-owned workspace and owner, admin, developer, operator, approver, and viewer role presets.
- Workspace ownership for scripts, workflows, projects, Ops profiles, secrets, agents, approvals, and Git-backed resources, with existing data migrated into the default workspace.
- Deny-by-default `resource:action` authorization with exact and wildcard grants, enforced in Node middleware and workspace-administration routes.
- Cross-workspace checks for client-requested workspace IDs and ID-addressed scripts, workflows, secrets, agents, approvals, Ops profiles, and Git projects.
- Hashed, expiring, individually revocable sessions; invitation, member, custom-role, session, grant-revocation, and audit APIs.
- Agent authority intersection across the initiating user's RBAC, agent access profile, workspace policy, and protected-action approval rules.
- **Settings → Workspace Access** for invitations, members, preset/custom roles, sessions, reusable-grant revocation, and workspace audit history.
- Final-owner protection prevents removal or demotion of the last active workspace owner.

Phase 8 verification evidence:

```powershell
Copy-Item -LiteralPath '..\p7\prisma\p7-test.db' -Destination 'prisma\p8-test.db' -Force
$env:DATABASE_URL='file:./p8-test.db'
npx prisma db execute --file prisma/migrations/20260713190000_phase8_teams_rbac/migration.sql --schema prisma/schema.prisma
npm run build
npm test
git diff --check
```

Results from the final post-fix verification pass:

- Phase 8 migration applied successfully to a fresh copy of the verified Phase 7 SQLite database.
- Next.js production build passed; all 50 static pages and all workspace-administration routes were generated.
- Vitest: 54 test files passed, 132 tests passed, 0 failures.
- Diff hygiene passed; Git emitted Windows line-ending conversion notices only.

Known Phase 8 validation limits:

- Manual multi-user validation from separate browsers/devices is not recorded.
- Preset-role walkthroughs in a deployed server instance are not recorded.
- API bearer tokens remain legacy administrator-level machine access; scoped machine identities are deferred to Phase 10 hardening.

Detailed plan and handoff:

- `docs/superpowers/plans/2026-07-13-phase-8-teams-rbac.md`
- `docs/superpowers/handoffs/2026-07-13-phase-8-teams-rbac.md`

## Current completion and integration state

- Phases 1–8 code complete: yes.
- Phases 1–8 automated verification complete: yes.
- Phase 8 commit: `8d78ad9`.
- Phase 8 manual multi-user/device validation complete: no.
- Phase 8 merged, pushed, or opened as a pull request: no.
- Root `main` reconciled with the sequential phase branches: no; inspect its divergent/unrelated state before any integration action.

## Phase 9 starting instructions

Proceed to Phase 9: plugin SDK and integration marketplace. Create `codex/phase-9-plugin-sdk` from the committed Phase 8 tip, not from `main` or an earlier phase branch.

The first Phase 9 slice should:

1. Define a versioned plugin manifest with compatibility version, declared capabilities, settings schema, node/provider contributions, and lifecycle hooks.
2. Map every plugin host capability to Phase 8 `resource:action` authorization and the authenticated workspace context; never trust a workspace ID supplied only by plugin code.
3. Expose narrow host APIs for HTTP, execution events, vault references, storage, workflow nodes, notifications, and approved desktop capabilities.
4. Prevent plugins from importing Prisma, reading raw secret plaintext, or accessing Electron internals directly.
5. Add explicit local trust/install/enable/disable/uninstall flows and contract tests before building marketplace UI.

Read these files first for Phase 9:

- `docs/superpowers/handoffs/2026-07-13-session-handoff.md`
- `docs/superpowers/handoffs/2026-07-13-phase-8-teams-rbac.md`
- `docs/superpowers/plans/2026-07-13-phase-8-teams-rbac.md`
- `src/lib/rbac/catalog.ts`
- `src/lib/rbac/authorization.ts`
- `src/lib/rbac/requestContext.ts`
- `src/lib/rbac/agentAuthority.ts`
- `src/lib/secrets/references.ts`
- `src/lib/workflows/types.ts`
- `src/lib/workflows/nodeExecutors.ts`
- `src/lib/notifications/adapters.ts`
- `electron/main.ts`
- `electron/preload.ts`

## Phase 9 implementation — plugin SDK and integration marketplace

Phase 9 is complete on `codex/phase-9-plugin-sdk`, based directly on the committed Phase 8 handoff tip `d392c4b`.

Delivered scope:

- Versioned plugin manifests, compatibility checks, declared capabilities, settings schemas, namespaced workflow nodes, lifecycle hooks, health, and update metadata.
- Explicit workspace-scoped local install, trust, enable, disable, settings, health, update-check, and uninstall flows.
- Ed25519 signature verification and explicit unsigned local-development opt-in.
- Restricted plugin host APIs with RBAC and manifest-capability enforcement; plugins receive opaque secret references but no Prisma, Electron internals, or raw secret resolver.
- Enabled plugin workflow-node execution through `plugin:<plugin-id>:<node-type>`.
- Settings → Plugins UI, SDK types, generator, documentation, and tested workflow-node/notification examples.

Verification evidence:

- Phase 9 migration replay from the verified Phase 8 database passed.
- Application and Electron TypeScript checks passed.
- Vitest: 59 files and 145 tests passed with 0 failures.
- Next.js production build passed and generated all plugin routes.
- Diff hygiene passed with Windows line-ending conversion notices only.

Detailed handoff: `docs/superpowers/handoffs/2026-07-13-phase-9-plugin-sdk.md`.

## Current completion state after Phase 9

- Phases 1–9 code complete: yes.
- Phases 1–9 automated verification complete: yes.
- Phase 9 manual Electron UI and external signed-package validation complete: no.
- Phase 9 merged, pushed, or opened as a PR: no.
- Remaining implementation phases: **1** — Phase 10 production hardening and release.
