# Troubleshooting

## Preflight reports a missing database

Confirm `DATABASE_URL` is a `file:` URL relative to `prisma/` and that the service account can read it. Do not create an empty file over the production database.

## Prisma fails on a fresh Windows/OneDrive database

This machine has reproduced a Prisma schema-engine failure while creating a brand-new SQLite file under OneDrive. Validate migrations in Linux CI or outside synchronized storage. A failed local fresh-file check does not authorize skipping CI migration evidence.

## Interrupted run after restart

Inspect the run timeline and node declaration. Resume only explicitly resumable nodes. Mark local processes and external writes interrupted unless their adapter provides an idempotent resume contract.

## Desktop agent is unavailable

Confirm the app is running in Electron, the provider executable is allowlisted and installed, and the profile root exists. The web build intentionally cannot spawn local ACP providers.

## Plugin is unhealthy

Disable it, inspect declared capabilities and signature/trust state, then run its health check. Plugins cannot receive Prisma, Electron internals, or raw vault plaintext; requests for those interfaces indicate an incompatible plugin.

## Windows Electron packaging fails with MSB8040

Electron Builder rebuilds `node-pty` for Electron. Install the Visual Studio C++ Spectre-mitigated libraries for the active MSVC toolset and x64 architecture, then rerun `npm run electron:pack`. Do not publish a package produced by disabling native rebuilds; terminal ABI compatibility would be unverified.
