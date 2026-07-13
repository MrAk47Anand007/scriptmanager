# Phase 7 Git-Backed Projects Handoff

## Status

- Code complete on `codex/phase-7-git-projects`, based on `codex/phase-6-acp-agents` at `8a7d0d9`.
- Automated verification complete: 48 test files, 121 tests passed.
- Production verification complete: `npm run build` passed, including Prisma generation, TypeScript, Next.js compilation, and static route generation.
- Manual desktop validation pending: connect a real repository, inspect a multi-file diff, commit on a disposable branch, and approve a push from the inbox.

## Delivered

- Projects now persist repository root, default branch, remote URL, and workspace policy.
- Workflow and agent profiles can persist a repository-backed project selection; invalid non-repository projects are rejected server-side.
- Git commands run through `spawn('git', args, { shell: false })` with bounded output and repository-root containment.
- Status, diff, branch, checkout, commit, fetch, pull, push, and cleanup contracts are implemented.
- Push, force, and cleanup operations pause for Phase 4 approval; Git actions emit unified execution events for human and agent actors.
- Source Control is a first-class workbench activity with project connection, status/conflict grouping, diff inspection, commit, branch context, fetch/pull/push, error, and approval-pending states.
- Agent profile creation can bind to a repository project and launches the ACP provider at that repository root.

## Verification commands

```powershell
$env:DATABASE_URL='file:./p7-test.db'
npx prisma db execute --file prisma/migrations/20260713170000_phase7_git_projects/migration.sql --schema prisma/schema.prisma
npm test -- --run
npm run build
git diff --check
```

The local test database had to be initialized outside the newly created OneDrive worktree and copied in because Prisma's Windows schema engine created zero-byte SQLite files in the fresh worktree. Applying the Phase 7 SQL to the initialized copy succeeded and all tests passed.

## Phase 8 starting point

Phase 8 should replace the current single-user actor defaults with authenticated workspace membership and resource/action authorization. Git authorization should intersect the initiating user's permission, agent access profile, project workspace policy, and protected-action approval policy.
