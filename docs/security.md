# Security Baseline

## Required secrets

Production deployments must set `SESSION_SECRET` and either `AUTH_SECRET` or `DESKTOP_AUTH_SECRET`. Storage credential encryption refuses to run in production without an encryption secret. The built-in development fallback exists only for local development and does not protect data from someone with source access.

## Execution telemetry

Script, API, webhook, scheduled, and remote executions use correlation identifiers and durable lifecycle events. Event payloads are redacted before persistence. Credential-shaped fields and explicitly registered secret values are replaced with `[REDACTED]`. Telemetry persistence failures are logged but never change the outcome of the user operation.

## Dependency audit

Run `npm audit` before release. The 2026-07-11 Phase 1 audit reduced findings from 27 (including 2 critical) to 7 with non-breaking updates. The remaining findings are transitive dependencies through Monaco, Prisma, and Next.js. Resolving them requires upstream-compatible upgrades; `npm audit fix --force` is prohibited because it proposes breaking or invalid dependency changes. CI must continue to expose new critical findings.

## Protected data rules

- Do not place plaintext credentials in execution event data.
- Do not return stored secrets through list APIs.
- Do not log webhook signatures, authorization headers, cookies, passwords, tokens, API keys, or private keys.
- Rotate encryption keys through a planned migration; changing the key makes existing encrypted provider values unreadable.
- Treat remote execution, webhook triggering, and integrated terminals as privileged capabilities.

# Production release controls

All responses receive CSP, frame, MIME-sniffing, referrer, and browser-permission headers. Public ingress must enforce bounded bodies, per-identity rate windows, signed timestamps, replay windows, and durable idempotency. Production dependency auditing runs in CI, while stable desktop artifacts require signing credentials and publish SHA-256 checksums.

Backups contain encrypted secrets and sensitive metadata and must be access-controlled. Audit exports must preserve actor, workspace, action, resource, correlation, and timestamp while excluding raw secret plaintext. See `backup-restore.md` and `upgrade-rollback.md` for the supported recovery boundary.
