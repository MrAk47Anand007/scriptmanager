# Phase 10 Acceptance Evidence

The deterministic contract in `config/production/acceptance.json` requires evidence for webhook, API, script, approval, Codex, Claude, remote action, notification, plugin node, and audit export. Existing Phase 1-9 tests exercise those subsystem contracts; Phase 10 adds release security, compatibility, recovery, accessibility, performance, packaging, and documentation gates around them.

Automated acceptance does not claim live external delivery, real provider installation, OS signing credentials, or manual Electron visual QA. Those require environment-specific release-candidate validation and must be recorded separately before public distribution.
