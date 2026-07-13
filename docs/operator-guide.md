# ScriptManager Operator Guide

## Deployment modes

Desktop installs run the Next.js application inside Electron and keep filesystem, terminal, OAuth, secure storage, and ACP process spawning behind typed preload APIs. Self-hosted installs run the web/server surface; they can inspect durable agent history but cannot spawn a user's local ACP provider.

Self-hosted production requires Node.js 22+, persistent storage for the SQLite database and workspace files, TLS at the reverse proxy, and unique `AUTH_SECRET`, `SESSION_SECRET`, and 32-byte `SCRIPTMANAGER_MASTER_KEY` values. Never bake these values into an image.

## Install and start

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run release:preflight
npm run build
npm start
```

Before every upgrade, create and verify a backup. After startup, verify login, Settings, one read-only workflow, audit export, and any configured notification channel. Stable desktop artifacts must come from a signed `v*` release workflow; unpacked CI artifacts are smoke-test outputs, not distributable installers.

## Routine operations

- Review failed and interrupted runs in Executions; resume only nodes marked resumable.
- Rotate vault keys and provider credentials through Settings, never by editing database ciphertext.
- Revoke stale sessions and reusable approval grants from Workspace Access.
- Export workspace audit records for incident and compliance review.
- Keep plugin unsigned-development mode disabled in production.
