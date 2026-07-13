# Backup and Restore

Stop ScriptManager or place it in maintenance mode so SQLite is not being written. Then run:

```powershell
npm run release:backup -- prisma/prod.db backups/scriptmanager-2026-07-13.db
```

The command writes the database atomically plus a `.json` manifest containing its byte count and SHA-256 digest. Store both files together and protect them as sensitive data: ciphertext, identities, audit history, and metadata remain confidential even though plaintext vault values are not exported.

To restore, stop all instances, retain the damaged database for forensics, and run:

```powershell
npm run release:restore -- prisma/prod.db backups/scriptmanager-2026-07-13.db
npx prisma migrate deploy
npm run release:preflight
```

Restore refuses a missing, renamed, truncated, or checksum-mismatched archive. Start one instance first and verify login, workflows, vault metadata, agent history, plugins, and audit export before restoring traffic.
