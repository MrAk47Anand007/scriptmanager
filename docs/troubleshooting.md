# Troubleshooting

## Preflight reports a missing database

Confirm `DATABASE_URL` is a `file:` URL relative to `prisma/` and that the service account can read it. Do not create an empty file over the production database.

## Prisma fails on a fresh Windows/OneDrive database

This machine has reproduced a Prisma schema-engine failure while creating a brand-new SQLite file under OneDrive. Validate migrations in Linux CI or outside synchronized storage. A failed local fresh-file check does not authorize skipping CI migration evidence.

## Interrupted run after restart

Inspect the run timeline and node declaration. Resume only explicitly resumable nodes. Mark local processes and external writes interrupted unless their adapter provides an idempotent resume contract.

## Desktop agent is unavailable

Confirm the app is running in Tauri desktop mode and that the provider is one of the allowlisted identities. In the current Tauri milestone, profile/history management and provider discovery are available, but ACP provider process execution is intentionally migration-pending. The web build cannot spawn local ACP providers.

## Plugin is unhealthy

Disable it, inspect declared capabilities and signature/trust state, then run its health check. Plugins cannot receive Prisma, legacy Electron internals, unrestricted Tauri desktop APIs, or raw vault plaintext; requests for those interfaces indicate an incompatible plugin.

## Windows desktop packaging fails with native rebuild errors

Older Electron packaging paths rebuilt `node-pty` and could fail with MSB8040 when Visual Studio Spectre-mitigated libraries were missing. The active desktop path is Tauri; run packaging from `tauri-app` and treat any native dependency failure as a release blocker until the matching toolchain is installed and a packaged smoke test passes.
