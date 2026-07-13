# Upgrade and Rollback

1. Read `CHANGELOG.md` and `config/production/compatibility.json`.
2. Back up the database and workspace files.
3. Run `npm run release:preflight` under the target production environment.
4. Install dependencies, generate Prisma Client, and run `npx prisma migrate deploy`.
5. Build and start one canary instance; run the smoke checklist in the operator guide.

Application downgrades and database schemas outside the declared compatibility range are blocked. Database migrations are forward-only. Rollback means restoring the pre-upgrade database and matching application artifact together; never run an older binary against a migrated database. Preserve the failed database, logs, release version, and correlation IDs for investigation.
