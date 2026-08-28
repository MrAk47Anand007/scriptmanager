# Electron Dual-Mode Foundation Design

## Purpose

Re-architect ScriptManager so it supports two first-class product modes without forcing one trust model onto the other:

- **Electron desktop mode** for local single-user usage, with no login screen and no renderer dependency on the public HTTP API.
- **Web server mode** for hosted and remote usage, keeping the existing server-oriented authentication and API model where appropriate.

The immediate goal of this design is to productionize the Electron path first while preserving a viable hosted web path for community members who want to run ScriptManager on a server.

## Problem Statement

The current repository mixes desktop and web concerns in ways that weaken both modes:

- Electron already exposes large desktop-only capabilities through preload and IPC, but the renderer still contains many browser-style `fetch('/api/...')` flows.
- The desktop app launches an embedded server and uses a desktop auth secret, which keeps the login screen out of the happy path but does not remove the server-shaped trust boundary.
- Sensitive server routes depend on session headers, request-body identity values, or route-level assumptions that do not cleanly map to desktop usage.
- Verification is misleading: `npm run typecheck`, `npm run test:security`, and `npm run test:acceptance` pass, but `npm test` fails because Prisma-backed integration tests do not provision `DATABASE_URL`.
- Deployment and release artifacts disagree on required production environment variables.

This creates unnecessary complexity for local desktop users and leaves production-hardening work mixed into feature work.

## Product Decision

ScriptManager will become a **dual-mode product** with a shared core:

1. **Desktop mode**
   - Packaged Electron app is the product.
   - Renderer speaks to preload/IPC, not to `/api/*` as its primary transport.
   - Local identity is implicit to the app instance and OS user context; there is no login UI.
   - Any embedded local server is an internal implementation detail and should be removed from renderer-facing flows over time.

2. **Web mode**
   - Hosted Next.js/Node application remains supported.
   - Browser clients continue to use HTTP APIs.
   - Login, session, RBAC, and server-facing security controls remain explicit.

The desktop and web modes share domain logic, storage models, and background execution behavior, but they use different transport and trust boundaries.

## Scope

This design covers the first sub-project only: **Electron production foundation and dual-mode separation**.

Included:

- desktop-first architecture and trust boundaries
- shared-core extraction boundaries
- transport split between desktop IPC and web HTTP
- desktop auth removal strategy
- server-route hardening required to keep web mode safe
- release, test, and verification changes needed for a production Electron build

Excluded:

- a full rewrite to Tauri, Avalonia, or Wails
- broad UI redesign
- completion of every unfinished feature
- multi-user collaboration semantics beyond the existing workspace model

## Current-State Facts

The following repository facts drive the design:

- Electron spawns its own packaged server process today and shares a desktop auth secret per launch.
- Preload already exposes a large `scriptManagerDesktop.runtime` IPC surface for scripts, collections, API requests, projects, server profiles, terminal access, remote execution, storage, and event streams.
- The renderer already contains desktop runtime adapters, proving the codebase can support a transport split without rewriting the UI.
- Middleware applies richer authorization behavior to session-authenticated requests than to bearer-token requests.
- Sensitive approval, secret, and remote-execution operations still have handler-level trust issues.
- The full test suite is not reliable by default because integration tests assume a Prisma database environment that `npm test` does not set up.

## Architecture Overview

The target architecture has four layers.

### 1. Shared Core

The shared core contains:

- domain services
- repositories
- execution engines
- workflow runtime
- secret and approval policies
- data validation and normalization

The shared core must not depend directly on Electron IPC, Next request objects, cookies, or browser globals. It should accept typed context and adapters.

### 2. Desktop Transport Layer

The desktop transport layer contains:

- Electron `main` process orchestration
- preload API surface
- IPC handlers
- desktop-only capabilities such as file pickers, clipboard, tray, notifications, OS-backed secret storage, terminal process control, and local agent spawning

The renderer should call typed desktop runtime functions, which map to IPC handlers, which then invoke shared-core services.

### 3. Web Transport Layer

The web transport layer contains:

- Next.js route handlers
- request/session parsing
- RBAC enforcement
- HTTP-only auth, approval, and API token semantics

These routes should also delegate to shared-core services rather than embedding business logic in handlers.

### 4. Runtime Hosts

There are two runtime hosts:

- **Desktop host**: Electron main process plus desktop-owned supporting processes
- **Web host**: Node server process for hosted deployments

Background workers, workflow execution, script execution, and persistence behavior should be host-aware but core-driven.

## Desktop Trust Model

Desktop mode intentionally changes the security model.

### Identity

- The packaged desktop app is treated as the authenticated local client.
- There is no browser-style login flow in packaged Electron mode.
- User-facing desktop actions derive actor identity from a local desktop session model, not from cookies, request headers, or request body fields.

### Transport

- Renderer never relies on public `/api/*` routes for normal desktop operations.
- Privileged actions flow through preload-exposed methods only.
- IPC handlers validate payload shape, derive caller context, and call shared-core services.

### Privilege boundaries

- Renderer is untrusted relative to preload and main.
- Preload exposes a narrow, typed API surface.
- Main process owns file system, OS integration, subprocess, terminal, and secret access.
- If a local embedded server remains temporarily necessary, it is not a public trust boundary for desktop mode and must not require user-facing auth semantics.

## Web Trust Model

Web mode keeps explicit authentication and authorization.

- Session and bearer-token flows must resolve to a single authorization model.
- Handler-level auth cannot rely on middleware alone for sensitive operations.
- Route handlers derive actor and workspace context from authenticated server state, never from body parameters.
- Secret reveal, approval decisions, and remote execution approvals must remain explicit server-authorized actions.

## Transport Split

The migration target is **shared use cases with separate adapters**.

### Desktop calls

Desktop renderer flows should resolve like this:

`React component -> desktop runtime client -> preload API -> ipcMain handler -> shared service -> repository`

### Web calls

Web browser flows should resolve like this:

`React/browser client -> HTTP route -> auth/RBAC -> shared service -> repository`

### Transitional rule

During migration, it is acceptable for desktop mode to retain a hidden embedded server for framework bootstrapping, but new desktop feature work must not add new renderer-to-HTTP dependencies. Existing HTTP-backed desktop flows should be moved behind IPC in priority order.

## Subsystems In Scope For Phase 1

Phase 1 focuses on the subsystems that define the product boundary.

### Desktop shell

- Electron startup
- packaged server bootstrap
- preload exposure review
- IPC handler organization
- desktop mode detection
- login suppression for packaged Electron

### Authentication and authorization

- unify session and bearer-token authorization semantics for web mode
- remove desktop dependence on session-cookie auth
- establish a desktop request context model for shared services

### Secrets and approvals

- remove body-supplied actor and workspace values from sensitive flows
- route reveal/approve/reject operations through trusted desktop or web contexts
- keep audit attribution accurate in both modes

### Remote execution and terminal access

- ensure desktop-triggered privileged operations are IPC-mediated
- preserve approval gates and audit events
- keep server-hosted remote operations protected by explicit web auth

### Verification and release

- make integration tests self-provision a test database or use a standard test harness
- align CI, release, Docker, Fly, and operator docs on env requirements
- define Electron-specific release gates and smoke checks

## Data Flow

### Desktop script-management flow

1. Renderer invokes a typed desktop runtime method.
2. Preload forwards the call over IPC.
3. Main-process handler validates the payload and resolves desktop context.
4. Shared-core service performs the operation.
5. Repository persists data through Prisma.
6. Main process returns structured success or error.
7. Renderer updates local state without HTTP transport.

### Web script-management flow

1. Browser client calls a route handler.
2. Route resolves authenticated request context and RBAC.
3. Shared-core service performs the operation.
4. Repository persists data through Prisma.
5. Route returns HTTP response.

### Execution and events

- Script, workflow, API, remote, and agent executions remain background operations owned by the host runtime.
- Renderer subscriptions in desktop mode come from IPC event streams.
- Browser subscriptions in web mode continue to use HTTP/SSE/WebSocket mechanisms as needed.

## Error Handling

The architecture must normalize errors by transport without duplicating business rules.

- Shared-core services return typed domain errors or throw typed exceptions.
- Desktop IPC maps those errors into structured IPC-safe responses.
- Web routes map the same errors into status-coded HTTP responses.
- No handler should leak raw secrets, stack traces, or request-body trust assumptions.

## Security Requirements

Phase 1 must enforce these invariants:

- Packaged Electron mode does not show a login screen or require browser-style auth for local use.
- Desktop renderer does not gain direct file system or process access outside preload-approved APIs.
- Sensitive actor identity is derived from trusted runtime context, never request body fields such as `approver_name` or `decidedBy`.
- Web bearer-token access cannot bypass RBAC or handler-level authorization.
- Secret listing never leaks plaintext, and secret reveal always records an authenticated actor and scoped resource context.
- Approval and remote-execution decisions are authorized and auditable in both modes.
- Shared cookie or auth state cannot bleed across users or workspaces in hosted mode.

## Verification Strategy

This sub-project is complete only when the following are true:

- `npm test` is reliable in a clean checkout and exercises Prisma-backed integration tests with a valid test database.
- Security-sensitive desktop flows have IPC-level tests.
- Security-sensitive web flows have handler/service integration tests.
- Electron packaged startup is smoke-tested with desktop auth/login suppression verified.
- CI enforces the same environment and verification expectations documented for operators.
- Release artifacts and deployment docs agree on required secrets and runtime setup.

## Production Release Gates For Electron

Electron production readiness requires:

- signed installer generation path remains intact
- packaged app starts without a manual login prompt
- database, scripts directory, and builds directory resolve to stable desktop-owned paths
- preload API is the only renderer-facing privileged bridge
- desktop notifications, terminal, script execution, and secret-backed settings work without HTTP-only assumptions

## Production Release Gates For Web

Web mode remains supported only if:

- hosted auth and RBAC are still enforced end-to-end
- required production secrets are consistently documented and validated
- server-only surfaces remain safe without assuming Electron runtime context

## Migration Order

The implementation plan for this design should follow this order:

1. Define shared request/actor context contracts for desktop and web.
2. Refactor sensitive services to consume trusted context rather than request-derived body values.
3. Add or complete IPC handlers for desktop-critical flows still routed through HTTP.
4. Remove packaged Electron login requirements and route desktop bootstrap through local context.
5. Repair test harness and environment provisioning.
6. Reconcile release/deployment artifacts and dependency posture.

## Alternatives Considered

### Keep Electron but continue using the public API for desktop

Rejected because it keeps browser-auth and desktop-local usage entangled, preserves unnecessary surface area, and makes the desktop app feel like a hosted client rather than a native product.

### Rewrite now to Tauri

Deferred. Tauri is a credible future option, but this repository is already deeply invested in Electron, Node-based execution, Prisma, PTY integration, and TypeScript runtime code. Rewriting before transport separation would combine product hardening with platform migration.

### Rewrite now to Avalonia or Wails

Deferred for the same reason. Both would require a larger UI/runtime migration than is justified before the current product boundary is made coherent.

## Out of Scope Follow-On Work

After this foundation phase, subsequent plans should cover:

- workflow production completion
- API client isolation and runtime hardening
- plugin/runtime isolation and production verification
- storage/notifications/agents subsystem completion
- optional desktop-platform rewrite evaluation once the shared-core and transport boundaries are stable

## Success Criteria

This design is successful when:

- the community can use ScriptManager as a packaged Electron app without seeing a web-style login flow
- the desktop app behaves like a local application that talks through IPC
- hosted users can still run ScriptManager as a web/server product with explicit auth
- security-critical operations use trusted actor context in both modes
- verification and release workflows accurately represent the real production state
