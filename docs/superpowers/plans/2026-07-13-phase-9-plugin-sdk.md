# Phase 9 Plugin SDK and Integration Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workspace-scoped plugin SDK and local integration marketplace that can contribute safe workflow nodes without importing Prisma or receiving raw secret plaintext.

**Architecture:** Persist plugin packages and installations separately: a package records validated manifest/source/signature metadata, while an installation records workspace trust, enabled state, settings, and health. Plugins execute through a provider-neutral runtime registry and narrow host facade whose capabilities are checked against both the manifest and the initiating workspace context. Workflow nodes use namespaced `plugin:<pluginId>:<nodeType>` identifiers and delegate through the registry without widening the core node union.

**Tech Stack:** Next.js 15 route handlers, TypeScript, Prisma 6/SQLite, React 19, Vitest, Node crypto.

## Global Constraints

- Unsigned packages require an explicit local-development opt-in at install time.
- Installed plugins are disabled until explicitly trusted and enabled.
- Plugins never receive Prisma, Electron internals, or raw secret plaintext.
- Every host call requires a declared manifest capability and workspace authorization.
- Plugin settings are schema-validated and secrets remain opaque `secret://` references.
- Tests are written and observed failing before production implementation.

---

### Task 1: Manifest and SDK contracts

**Files:**
- Create: `src/lib/plugins/types.ts`
- Create: `src/lib/plugins/manifest.ts`
- Create: `sdk/plugin/index.ts`
- Test: `tests/unit/pluginManifest.test.ts`

**Interfaces:**
- Produces: `PluginManifestV1`, `PluginNodeDefinition`, `PluginHost`, `validatePluginManifest(value)` and compatibility/capability constants.

- [ ] Write failing tests for valid manifests, incompatible versions, duplicate contributions, unsafe identifiers, invalid settings schemas, and undeclared lifecycle hooks.
- [ ] Implement strict versioned parsing with namespaced node identities and JSON-safe settings schemas.
- [ ] Re-export author-facing contracts from `sdk/plugin/index.ts` and run the focused suite to green.

### Task 2: Persistence, signatures, and explicit trust lifecycle

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260713200000_phase9_plugin_sdk/migration.sql`
- Create: `src/lib/plugins/signatures.ts`
- Create: `src/lib/plugins/registry.ts`
- Test: `tests/integration/pluginRegistry.test.ts`

**Interfaces:**
- Produces: workspace-scoped install/list/enable/disable/uninstall/update-settings/health operations and Ed25519 signature verification.

- [ ] Write failing lifecycle tests proving install is explicit, unsigned packages need opt-in, enable requires trust, cross-workspace access is denied, settings are validated, and uninstall removes only the installation.
- [ ] Add package and installation models with audit-safe metadata, unique package versions, and unique workspace installations.
- [ ] Implement canonical manifest hashing, optional Ed25519 verification, and registry lifecycle transitions.
- [ ] Run migration and focused tests to green.

### Task 3: Restricted host and workflow-node execution

**Files:**
- Create: `src/lib/plugins/host.ts`
- Create: `src/lib/plugins/runtime.ts`
- Modify: `src/lib/workflows/types.ts`
- Modify: `src/lib/workflows/nodeExecutors.ts`
- Modify: `src/lib/rbac/catalog.ts`
- Test: `tests/unit/pluginHost.test.ts`
- Test: `tests/integration/pluginWorkflowNode.test.ts`

**Interfaces:**
- Produces: capability-checked `createPluginHost(context, manifest, adapters)` and `executePluginNode(namespacedType, config, input, context)`.

- [ ] Write failing host tests for HTTP, events, vault references, storage, notifications, and desktop requests, including undeclared capability and insufficient-RBAC denial.
- [ ] Write a failing workflow test proving an enabled example plugin executes a namespaced node and a disabled plugin fails safely.
- [ ] Implement host capability checks and opaque secret-reference handling; do not expose a secret resolution method.
- [ ] Extend workflow node typing/execution to delegate namespaced plugin nodes through an optional plugin adapter.
- [ ] Run focused and existing workflow/RBAC suites to green.

### Task 4: Plugin management APIs and settings UI

**Files:**
- Create: route handlers under `src/app/api/plugins`
- Create: `src/components/settings/PluginsSection.tsx`
- Modify: `src/components/settings/SettingsLayout.tsx`
- Test: `tests/integration/pluginRoutes.test.ts`
- Test: `tests/unit/pluginsUi.test.tsx`

**Interfaces:**
- Produces: list/install/enable/disable/uninstall/settings/health/update-check endpoints and Settings → Plugins management surface.

- [ ] Write failing route tests for authenticated workspace scoping, permission denial, lifecycle transitions, health, and update metadata.
- [ ] Implement normalized route responses using Phase 8 request context and `plugin:manage`/`plugin:read` authorization.
- [ ] Write and implement UI coverage for empty, unsigned-warning, disabled, healthy/unhealthy, settings, update, and uninstall states.
- [ ] Run focused suites to green.

### Task 5: Generator, documentation, and example plugins

**Files:**
- Create: `scripts/create-scriptmanager-plugin.mjs`
- Create: `examples/plugins/notification/plugin.ts`
- Create: `examples/plugins/workflow-node/plugin.ts`
- Create: `docs/plugins/SDK.md`
- Modify: `package.json`
- Test: `tests/unit/pluginExamples.test.ts`

**Interfaces:**
- Produces: `npm run plugin:create -- <directory> <plugin-id>` and two validated example packages using only SDK contracts.

- [ ] Write failing tests that validate example manifests, execute the workflow example through the restricted host, and statically reject imports of Prisma/Electron internals.
- [ ] Add the generator and SDK documentation covering trust, signatures, capabilities, settings, lifecycle, health, and update metadata.
- [ ] Add notification and uppercase-transform workflow examples and run focused tests to green.

### Task 6: Phase exit verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-scriptmanager-platform-master-roadmap.md`
- Modify: `README.md`
- Create: `docs/superpowers/handoffs/2026-07-13-phase-9-plugin-sdk.md`
- Modify: `docs/superpowers/handoffs/2026-07-13-session-handoff.md`

- [ ] Apply the Phase 9 migration to a copy of the verified Phase 8 database.
- [ ] Run focused tests, `npm test`, `npx tsc --noEmit`, `npx tsc -p electron/tsconfig.json --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Record code-complete, automated-verification, signature/live-plugin, and manual UI validation separately.
- [ ] Commit only intentional Phase 9 files on `codex/phase-9-plugin-sdk`.
