# Phase 9 Plugin SDK and Integration Marketplace Handoff

## Truth source

- Branch: `codex/phase-9-plugin-sdk`
- Worktree: `.worktrees/p9`
- Base: Phase 8 completion/handoff commit `d392c4b`
- Phase 8 implementation ancestry: `8d78ad9`
- Root `main` remains divergent and is not the integration source.

## Delivered

- Strict version-1 plugin manifest, compatibility, capability, settings, workflow-node, lifecycle, health, and update metadata contracts.
- Workspace-scoped package/install persistence with separate install, trust, enable, disable, settings, health, update-check, and uninstall operations.
- Ed25519 signature verification over canonical manifest/source payloads. Unsigned packages require explicit local-development opt-in and remain visibly marked.
- Restricted host facade for HTTP, events, opaque vault references, storage, notifications, and approved desktop requests. Every call checks declared capability and `plugin:run`; there is no raw secret-resolution, Prisma, or Electron-internals API.
- Namespaced `plugin:<plugin-id>:<node-type>` workflow execution through an enabled runtime registry.
- Server-authorized plugin APIs and Settings → Plugins management UI.
- Public SDK types, `npm run plugin:create`, SDK documentation, and tested workflow-node and notification examples.
- RBAC catalog support for plugin read/run/manage access.

## Verification

Fresh Phase 9 evidence:

- Migration replay from a clean copy of the verified Phase 8 database: passed.
- Application TypeScript: `npx tsc --noEmit` passed.
- Electron TypeScript: `npx tsc -p electron/tsconfig.json --noEmit` passed.
- Vitest: 59 files passed, 145 tests passed, 0 failures.
- Production build: passed; all three plugin route groups appeared in the Next.js manifest and 51 static pages were generated.
- `git diff --check`: passed with Windows line-ending conversion notices only.

## Validation limits

- Automated examples run in-process through the restricted host. Loading a packaged third-party module in a separate sandbox/process is deferred to Phase 10 hardening.
- Signature support is covered at the contract level; a real external publisher key and remote update feed were not validated live.
- Manual Settings → Plugins visual QA in a running Electron window was not recorded.
- The pre-existing Node `DEP0169` dependency warning remains during build.

## Remaining roadmap

Only **one phase remains**: Phase 10 — production hardening and release. It covers CI breadth, backup/restore and migration preflight, rate/request/security controls, accessibility/performance, signed installers/update channels, complete operator/security/ACP/plugin documentation, and the end-to-end acceptance scenario.
