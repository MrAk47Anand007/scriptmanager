# Phase 5 Shared Encrypted Secret Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace product-specific plaintext and encrypted credential storage with one audited vault that exposes only opaque references outside trusted server-side resolution boundaries.

**Architecture:** Prisma stores secret metadata, immutable encrypted versions, resource bindings, and access events. A provider-neutral `SecretStore` encrypts/decrypts version payloads, while `SecretVaultService` owns capability checks, create/rotate/disable/reference/reveal-once operations, server-side resolution, audit, and redaction registration. Existing integrations retain compatibility fields only long enough to migrate them into vault references.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6/SQLite, Node crypto, Electron `safeStorage`, typed IPC, Vitest.

## Global Constraints

- Never persist plaintext in secret metadata, bindings, access events, workflow definitions, execution inputs, logs, Redux, API responses, exports, or future ACP transcripts.
- Reveal is one-time response behavior and always creates an access event.
- Secret resolution is server-side, capability-scoped, resource-scoped, and denied for disabled secrets.
- Existing script, API, Ops, storage, workflow, Electron, and web behavior remains compatible during migration.
- Follow red-green TDD and finish with tests, application/electron typechecks, production build, and diff hygiene.

---

### Task 1: Durable vault schema and provider-neutral stores

**Files:** Modify `prisma/schema.prisma`; create `prisma/migrations/20260713150000_phase5_secret_vault/migration.sql`; create `src/lib/secrets/types.ts`, `store.ts`, and `serverStore.ts`; modify `electron/main.ts`, `electron/preload.ts`, and `src/types/electron.d.ts`; test `tests/unit/secretStore.test.ts`.

**Interfaces:** Produce `SecretStore.seal(plaintext, context): Promise<string>` and `SecretStore.open(ciphertext, context): Promise<string>`, plus `Secret`, `SecretVersion`, `SecretBinding`, and `SecretAccessEvent` persistence models.

- [ ] Write tests proving ciphertext round trips, differs for identical plaintext, rejects tampering, and requires a production master key.
- [ ] Run `npx vitest run tests/unit/secretStore.test.ts` and verify failure because the store modules do not exist.
- [ ] Add the schema, migration, AES-256-GCM server store, and Electron `safeStorage` bridge.
- [ ] Generate Prisma and rerun the focused test to green.

### Task 2: Audited vault service and capabilities

**Files:** Create `src/lib/secrets/service.ts` and `src/lib/secrets/policy.ts`; test `tests/integration/secretVaultService.test.ts`.

**Interfaces:** Produce `createSecret`, `rotateSecret`, `disableSecret`, `bindSecret`, `resolveSecret`, and `revealSecretOnce`; consume actor, capability, workspace, resource, and reason context on every read.

- [ ] Write integration tests for create, rotation, disabled denial, binding, reveal-once audit, capability/resource mismatch, ciphertext-only persistence, and metadata-only listings.
- [ ] Run the focused integration test and verify failure for the missing service.
- [ ] Implement minimal transactional service methods and immutable access-event recording.
- [ ] Rerun the focused test to green.

### Task 3: Opaque references and existing integration migration

**Files:** Create `src/lib/secrets/references.ts` and `migration.ts`; modify script env/webhook routes, Ops secret storage/SSH resolution, storage provider persistence, workflow webhook storage/resolution, and API request materialization; test `tests/integration/secretMigration.test.ts` and `tests/unit/secretReferences.test.ts`.

**Interfaces:** Produce opaque references shaped as `{ "secretRef": "secret_<id>" }`; serialized product state contains references or masks, while runtime adapters receive plaintext only in ephemeral local variables.

- [ ] Write failing tests proving legacy values migrate once, references resolve only at execution time, and serialized inputs never contain migrated plaintext.
- [ ] Implement idempotent lazy migration helpers and server-side reference resolution.
- [ ] Update script env, SSH, storage, workflow webhook, and API-auth paths to use vault references while accepting legacy records.
- [ ] Run focused and existing execution/storage/workflow tests to green.

### Task 4: Vault API and settings UI

**Files:** Create routes under `src/app/api/secrets/**`; create `src/components/settings/SecretsSection.tsx`; modify `src/components/settings/SettingsLayout.tsx`; test `tests/integration/secretRoutes.test.ts`.

**Interfaces:** APIs return metadata, binding counts, rotation state, and access history; only create/rotate/reveal responses may contain the submitted/revealed plaintext, and reveal requires an explicit capability context.

- [ ] Write failing route tests for list/create/rotate/disable/bind/reveal/history and response leakage.
- [ ] Implement authenticated thin routes over `SecretVaultService`.
- [ ] Build the settings vault with scope, usage references, rotation state, disable/rotate controls, reveal-once confirmation, and access history.
- [ ] Run focused route tests and application typecheck to green.

### Task 5: Redaction regressions, documentation, and completion gate

**Files:** Create `tests/integration/secretRedaction.test.ts`; modify execution redaction/export/observability paths, `README.md`, and `docs/superpowers/handoffs/2026-07-13-session-handoff.md`.

- [ ] Write failing regressions that seed a unique secret and scan persisted execution records, workflow records, notification deliveries, API JSON, exports, and transcript-shaped payloads for plaintext.
- [ ] Register resolved values with the existing redaction boundary and remove any leaking serialization paths.
- [ ] Document vault behavior, migration compatibility, configuration, and validation limits.
- [ ] Run `npm test`, `npx tsc --noEmit`, `npx tsc -p electron/tsconfig.json --noEmit`, `npm run build`, and `git diff --check`.

## Acceptance Gate

- Existing credential-backed integrations resolve vault references server-side.
- Ciphertext and metadata are the only persisted secret-version values.
- Disabled, mismatched, or unauthorized reads fail and are audited.
- Vault APIs and UI expose metadata and one-time values only where explicitly allowed.
- Automated leakage scans cannot recover plaintext from persisted product records.
