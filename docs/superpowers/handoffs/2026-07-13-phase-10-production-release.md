# Phase 10 Production Hardening Handoff

## Truth source

- Branch: `codex/phase-10-production-release`
- Worktree: `.worktrees/p10`
- Base: Phase 9 handoff commit `c476fcf`
- Phases 1-9 remain in sequential ancestry; root `main` is not the truth source.

## Delivered

- Split CI gates for unit/security/accessibility, integration/migration/acceptance/performance, application/Electron typechecks, production build, and Electron package-directory smoke.
- Tag-driven stable desktop release workflow for Windows, macOS, and Linux, with signing-secret gates, channel input, checksums, and GitHub release artifacts.
- Atomic SQLite backup and checksum-verified restore commands, production preflight, compatibility metadata, and interrupted-node recovery rules.
- Rate windows, 1 MiB public-webhook body limits, signed script-webhook replay timestamps, durable workflow delivery idempotency, CSP/browser security headers, dependency audit threshold, and downloadable workspace audit JSONL.
- Visible focus, reduced-motion, forced-colors, and 2,000-node performance regression checks.
- Version 1.0 release metadata, changelog, operator/backup/upgrade/ACP/workflow/troubleshooting/security/plugin documentation, and cross-subsystem acceptance evidence.

## Verification evidence

- Full Vitest: 65 files, 156 tests, 0 failures.
- Phase 10 focused tests: 6 files, 11 tests, 0 failures.
- Application TypeScript: passed.
- Electron TypeScript: passed.
- Prisma migration status: 28 migrations, schema up to date after reconciling four historical manually replayed migration records in the copied verification database.
- Backup/restore: preflight passed and restored database SHA-256 matched the source.
- Next.js production build: passed; 51 pages generated and hardened routes appeared in the manifest.
- Production dependency gate: zero high or critical advisories; four low/moderate transitive advisories remain with no safe non-breaking npm remediation.

## Pending release-candidate evidence

- Local `npm run electron:pack` reaches Electron Builder but fails rebuilding `node-pty` with `MSB8040`: Visual Studio Spectre-mitigated C++ libraries are not installed. Install that VS component or use the clean Windows CI packaging job, then retain the artifact output.
- Real OS signing/notarization requires repository signing secrets and a tagged release.
- Live Codex/Claude ACP binaries, external Slack/SMTP/Teams/webhook delivery, manual Electron visual/accessibility QA, and a real remote target remain environment-specific acceptance steps.
- Fresh SQLite creation remains blocked by the documented Prisma Windows/OneDrive schema-engine issue; Linux CI is the authoritative fresh migration gate.

## Migration-history note

The verified Phase 9 databases contained Phase 7-9 schema changes applied by direct migration replay, plus a previously failed-but-fixed Phase 6 history row. The copied Phase 10 verification database required:

```powershell
npx prisma migrate resolve --applied 20260713143000_add_agent_runtime
npx prisma migrate resolve --applied 20260713170000_phase7_git_projects
npx prisma migrate resolve --applied 20260713190000_phase8_teams_rbac
npx prisma migrate resolve --applied 20260713200000_phase9_plugin_sdk
```

Use `migrate resolve` only after confirming the corresponding tables/columns already exist and a verified backup is available. New installations must use `npx prisma migrate deploy` normally.

## What remains — next execution order

1. **Packaging gate:** install the Visual Studio Spectre-mitigated C++ libraries or run the Windows CI packaging job, then prove the packaged Electron application launches with a working terminal.
2. **Branch integration gate:** inspect divergent `main`, push `codex/phase-10-production-release`, open a PR, and require every new CI job to pass.
3. **Live acceptance gate:** exercise real Codex/Claude ACP binaries, notification transports, a disposable Git remote, a non-production remote host, plugin execution, and audit export.
4. **Manual QA gate:** perform Electron visual, keyboard-only, screen-reader, forced-colors, reduced-motion, and multi-user role walkthroughs.
5. **Signing gate:** configure Windows/macOS signing and notarization secrets, create a pre-release tag, verify checksums/install/upgrade/rollback, then publish `v1.0.0` only when all evidence is recorded.

The roadmap implementation is code-complete, but ScriptManager 1.0 is not release-complete until these five gates are green.
