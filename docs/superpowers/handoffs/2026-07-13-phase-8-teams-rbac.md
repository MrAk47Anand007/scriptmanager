# Phase 8 Teams, RBAC, and Workspace Policy Handoff

## Status

- Code complete on `codex/phase-8-teams-rbac`, based directly on Phase 7 commit `5d54d48`.
- Automated verification complete: 54 test files and 132 tests passed.
- Production verification complete: Prisma generation, TypeScript validation, Next.js compilation, and static route generation passed.
- Manual multi-user validation pending: sign in as each preset role in a deployed server instance, exercise the Workspace Access screens, and confirm session revocation from a second browser/device.

## Delivered

- Added persisted users, workspaces, memberships, roles, role permissions, invitations, and hashed/revocable sessions.
- Added an idempotent local bootstrap that preserves single-user desktop behavior with an administrator-owned default workspace and six role presets.
- Migrated existing scripts, workflows, projects, Ops profiles, agent runs, and other already-scoped Phase 4–7 records into the default workspace through schema defaults and deterministic seed records.
- Added deny-by-default `resource:action` authorization with exact, resource-wildcard, and owner-wildcard permissions.
- Enforced RBAC in Node middleware for scripts, workflows, secrets, agents, approvals, Ops, Git, and workspace administration; ID-based resource checks reject cross-workspace access.
- Scoped core collection routes and new records to the authenticated workspace instead of trusting client-provided workspace IDs.
- Bound agent authority to the intersection of the initiating user's RBAC, the agent profile, workspace policy, and existing protected-action approval rules.
- Added member/invitation, custom-role, session, grant-revocation, and audit APIs plus **Settings → Workspace Access**.
- Added owner safety that prevents demoting or removing the final active workspace owner.

## Verification evidence

```powershell
Copy-Item -LiteralPath '..\p7\prisma\p7-test.db' -Destination 'prisma\p8-test.db' -Force
$env:DATABASE_URL='file:./p8-test.db'
npx prisma db execute --file prisma/migrations/20260713190000_phase8_teams_rbac/migration.sql --schema prisma/schema.prisma
npm test
npm run build
git diff --check
```

Latest evidence before handoff documentation:

- Phase 8 migration applied successfully to a fresh copy of the verified Phase 7 SQLite database.
- `npm test`: 54 files passed, 132 tests passed, 0 failures.
- `npm run build`: exit 0; all 50 static pages and workspace administration routes generated.
- `git diff --check`: exit 0; only line-ending conversion warnings were reported by Git status output.

## Security boundary

- The browser UI is advisory; middleware and authorization services are the enforcement boundary.
- Session tokens carry user/workspace/session identity, while the database stores only their SHA-256 hashes and revocation/expiry state.
- Cross-workspace resource ownership is checked independently of role permission.
- API bearer-token compatibility remains administrator-level legacy access until Phase 10 adds scoped machine identities.
- Protected agent actions still require Phase 4 approval even when the RBAC/profile/workspace intersection allows the underlying capability.

## Phase 9 starting point

Phase 9 can build the plugin SDK against stable workspace, permission, secret-reference, execution, agent, and approval interfaces. Plugin host capabilities must map to this phase's `resource:action` catalog and must never accept a workspace ID supplied only by plugin code.
