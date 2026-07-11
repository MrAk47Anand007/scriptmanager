# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Setup database (run once after clone or after schema changes)
npm run db:generate   # generate Prisma client
npm run db:migrate    # apply migrations, creates ./data/scriptmanager.db

# Development
npm run dev           # starts the custom server (Next.js + WebSockets + scheduler)

# Production
npm run build         # prisma generate + next build
npm start             # runs the production server via ts-node

# Database utilities
npm run db:studio                    # open Prisma Studio
npm run db:reset:clean               # reset DB only
npm run db:reset:clean:files         # reset DB + wipe scripts/builds dirs

# Electron desktop
npm run electron:dev   # Next.js dev server + Electron window concurrently
npm run electron:build # full distributable (NSIS/DMG/AppImage)
npm run electron:pack  # package without installer (for testing)
```

There is no test suite in this project.

## Architecture

### Server bootstrap (`server.ts`)

The entry point is a custom HTTP server that wraps Next.js and adds three long-lived singletons:
- **Cron scheduler** (`src/lib/schedulerService.ts`) — loaded once at boot; runs `croner` jobs for every enabled script schedule.
- **Terminal WebSocket server** (`src/lib/socketService.ts`) — node-pty over WebSockets; gives the browser a real PTY.
- **Build WebSocket server** (`src/lib/buildSocketService.ts`) — streams live build output to subscribed clients.

`npm run dev` runs `scripts/dev-server.mjs`, not `next dev`, so that these services are always running in development.

### Deployment modes

The same Next.js codebase runs in three modes:

| Mode | Entry | Auth |
|---|---|---|
| Web server | `server.ts` | Session cookie or Bearer API token |
| Docker | `server.ts` via `docker-compose.yml` | Same as web |
| Electron desktop | `electron/main.ts` spawns `server.ts` on port 3141 | Ephemeral `DESKTOP_AUTH_SECRET` cookie bypasses login |

The Electron process stores its database and scripts in `app.getPath('userData')`. In dev mode it uses `./data/` like the web server.

### Runtime client abstraction

Several files in `src/lib/` act as routing layers that switch between the web API and Electron IPC:

- `src/lib/scriptsRuntimeClient.ts` — checks `window.scriptManagerDesktop?.runtime`; if present, calls Electron IPC handlers in `electron/desktopRuntime.ts` instead of HTTP.
- `src/lib/opsRuntimeClient.ts` — same pattern for the Ops feature.
- `src/lib/storageRuntimeClient.ts` — same pattern for cloud storage.

This is why API calls in the frontend never go directly to `fetch('/api/...')` for script operations — they always go through these clients.

### Authentication (`src/middleware.ts`)

Runs in Node.js runtime (not Edge) because it uses `node:crypto`. Two auth paths:
1. **Session cookie** (`sm_session`): HMAC-signed cookie set by `/api/auth/login`.
2. **Bearer token**: Hashed and stored in the `settings` table under `api_token_hash`; used by the CLI and API clients.

`/api/webhooks/` is the only API prefix that is entirely unauthenticated — the webhook token itself is the secret.

### Script execution (`src/lib/scriptRunner.ts`)

- Builds are written to disk (`./builds/`) as text log files; the `Build` DB record stores the path.
- `buildEmitters` is a module-level `Map<buildId, EventEmitter>` used to fan out live output to multiple WebSocket subscribers.
- `assertSafeStoredFilename()` (from `executionSafety.ts`) is called before every exec to prevent path traversal.
- Scripts are resolved via `src/lib/scriptPathResolver.ts`; if a collection has a cloud binding, `ensureFreshScript()` (syncService) pulls the latest version from the remote before running.

### Cloud storage (`src/lib/storage/`)

Provider abstraction with a uniform `StorageProviderClient` interface. Supported providers: S3, GCS (S3-compatible endpoint), WebDAV, Google Drive, OneDrive. Provider configs are AES-encrypted at rest via `secretBox.ts`.

Collections can be bound to a storage provider + remote prefix. On every script run, `syncService.ts` does a pull-on-run; on every save it does a push. A `remoteEtag` field on `Script` tracks sync state to detect conflicts.

OAuth for Google Drive and OneDrive runs through `electron/oauthFlow.ts` in desktop mode (opens the system browser via Electron's `shell.openExternal`).

### Redux state (`src/features/`)

Five slices:

| Slice | Module | What it manages |
|---|---|---|
| `scriptsSlice` | `src/features/scripts/` | Scripts, collections, builds, env vars, tags, versions |
| `workbenchSlice` | `src/features/workbench/` | Editor tabs, side panel state, command palette, dock toggle |
| `apiSlice` | `src/features/api/` | Postman-like API client (collections, requests, environments) |
| `opsSlice` | `src/features/ops/` | Ops mode (remote server profiles, remote executions) |
| `settingsSlice` | `src/features/settings/` | App settings |

### API batching

`/api/bootstrap` (GET) returns scripts + collections + settings in one round-trip to reduce startup latency. Scripts are cached in `src/lib/cache.ts` for 5 minutes. The cache is invalidated on any script mutation.

### Built-in API client (Postman-like)

Separate from the script manager: `ApiCollection`, `ApiRequest`, `ApiEnvironment`, `ApiHistory`, `ApiCollectionRun` models in the schema. Routes are under `/api/api-collections`, `/api/api-requests`, etc. The feature has its own Redux slice and view components in `src/components/api/`.

### Ops mode

A separate execution path for running scripts on remote SSH servers. `ServerProfile` records store encrypted SSH credentials. `RemoteExecution` records have an approval workflow (`pending_approval` → `approved` → `running` → done). Separate IPC path in `electron/opsRuntime.ts`.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./data/scriptmanager.db` | Prisma connection string |
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | `scriptmanager-dev-secret-change-me` | HMAC key for session cookies |
| `DESKTOP_AUTH_SECRET` | _(generated)_ | Electron bypass token |
| `SCRIPTS_DIR` | `./user_scripts` | Script file storage directory |
| `BUILDS_DIR` | `./builds` | Build log directory |

`OneDrive` paths use `os.tmpdir()` for builds (to avoid cloud-sync conflicts with large log files).

## Key File Locations

- `src/lib/scriptRunner.ts` — script execution engine
- `src/lib/schedulerService.ts` — cron scheduler (singleton, lives in server process)
- `src/lib/socketService.ts` — terminal WebSocket + node-pty
- `src/lib/buildSocketService.ts` — build output streaming WebSocket
- `src/lib/storage/syncService.ts` — cloud pull-on-run / push-on-save logic
- `src/lib/executionSafety.ts` — filename sanitization guard
- `electron/desktopRuntime.ts` — IPC handlers for all script operations in desktop mode
- `electron/oauthFlow.ts` — OAuth PKCE flow for cloud providers
- `prisma/schema.prisma` — full DB schema
