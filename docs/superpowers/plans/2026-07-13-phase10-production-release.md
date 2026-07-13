# Phase 10 Production Hardening and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ScriptManager's desktop and self-hosted builds repeatably testable, recoverable, security-hardened, upgrade-compatible, and operator-documented.

**Architecture:** Keep release logic in small dependency-free modules under `src/lib/release` and executable Node entrypoints under `scripts`. Apply HTTP protections at the shared Next.js boundary and route-specific replay checks at public webhooks. CI composes deterministic unit, integration, migration, security, accessibility, Electron, packaging, and acceptance gates.

**Tech Stack:** Next.js 15, TypeScript, Prisma/SQLite, Vitest, Electron Builder, GitHub Actions, Node.js 22.

## Global Constraints

- Preserve all Phase 1-9 API, vault, RBAC, approval, ACP, and plugin security boundaries.
- Never serialize plaintext secrets into backups, audit exports, release evidence, logs, or workflow definitions.
- Production webhooks use bounded bodies, HMAC verification, replay windows, idempotency, and rate limiting.
- Unsigned desktop artifacts are development-only; release channels require configured signing credentials.
- The Windows/OneDrive Prisma fresh-file engine failure is a documented local validation limit, not a skipped CI migration gate.

---

### Task 1: Release security primitives

**Files:**
- Create: `src/lib/release/httpSecurity.ts`
- Create: `src/lib/release/compatibility.ts`
- Test: `tests/unit/releaseHttpSecurity.test.ts`
- Test: `tests/unit/releaseCompatibility.test.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces `checkRateLimit`, `readBoundedBody`, `verifyReplayWindow`, `securityHeaders`, and `assertUpgradeCompatible`.

- [ ] Write unit tests for rate-window reset, size rejection, stale replay rejection, CSP headers, and incompatible downgrade/schema cases.
- [ ] Run the two test files and confirm failures because the release modules do not exist.
- [ ] Implement the minimal dependency-free primitives and configure production security headers.
- [ ] Re-run the two test files and confirm all pass.

### Task 2: Backup, restore, preflight, and recovery tooling

**Files:**
- Create: `scripts/release-data.mjs`
- Create: `scripts/release-preflight.mjs`
- Create: `src/lib/release/recovery.ts`
- Test: `tests/unit/releaseRecovery.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces CLI commands `release:backup`, `release:restore`, `release:preflight`, and recovery classifiers that never resume non-resumable interrupted work.

- [ ] Write failing recovery classification and corrupt-backup rejection tests.
- [ ] Implement atomic SQLite backup/restore with SHA-256 sidecars, migration preflight, compatibility metadata, and interrupted-run recovery planning.
- [ ] Run focused tests and CLI help/preflight smoke checks.

### Task 3: CI and release pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `release/compatibility.json`
- Create: `CHANGELOG.md`

**Interfaces:**
- CI provides independent unit, integration, migration, security, accessibility, Electron smoke, packaging, acceptance, audit, and build evidence.

- [ ] Split CI into named gates and ensure Prisma generation/database preparation precedes database tests.
- [ ] Add dependency audit and deterministic release preflight gates.
- [ ] Add tag-driven signed Electron release jobs for stable, beta, and nightly channels with artifact checksums.
- [ ] Add release compatibility metadata and release notes.

### Task 4: Accessibility and large-data regression coverage

**Files:**
- Modify: `src/app/globals.css`
- Create: `tests/unit/accessibilityRelease.test.ts`
- Create: `tests/performance/largeData.test.ts`

**Interfaces:**
- Provides visible focus, reduced-motion behavior, keyboard-safe global CSS, and bounded large-data checks for filters/redaction/graph planning.

- [ ] Write failing source-level accessibility and performance regression tests.
- [ ] Add focus-visible, reduced-motion, contrast-safe selection, and forced-colors rules.
- [ ] Run focused accessibility and performance tests.

### Task 5: Operator documentation and acceptance evidence

**Files:**
- Modify: `README.md`
- Create: `docs/operator-guide.md`
- Create: `docs/backup-restore.md`
- Create: `docs/upgrade-rollback.md`
- Create: `docs/acp-providers.md`
- Create: `docs/workflows.md`
- Create: `docs/troubleshooting.md`
- Create: `docs/releases/phase-10-acceptance.md`
- Modify: `docs/security.md`
- Modify: `docs/plugins/SDK.md`
- Create: `tests/integration/releaseAcceptance.test.ts`

**Interfaces:**
- Documents both deployment modes and records one deterministic cross-subsystem acceptance contract.

- [ ] Add a failing acceptance test that validates the release manifest and required subsystem evidence.
- [ ] Implement the acceptance manifest/evidence and complete all operator-facing guides.
- [ ] Run the acceptance test, then the full migration, typecheck, test, build, Electron, package-directory, audit, and diff-hygiene gates.
