# Changelog

## 1.0.0 - 2026-07-13

ScriptManager 1.0 completes the local-first automation and AI workbench roadmap: durable workflows and observability, approvals and notifications, encrypted secrets, Codex/Claude ACP agents, Git projects, workspace RBAC, capability-scoped plugins, and production release controls.

### Release requirements

- Back up the SQLite database before upgrading.
- Run `npm run release:preflight` with the production environment loaded.
- Node.js 22 or newer is required for self-hosted deployments.
- Stable desktop tags require platform signing credentials; unsigned builds are development artifacts only.
