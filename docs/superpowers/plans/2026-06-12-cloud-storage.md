# Cloud Storage Implementation Plan

Spec: docs/superpowers/specs/2026-06-12-cloud-storage-design.md. Branch: feat/cloud-storage.
Verification per task: `npx tsc --noEmit` + `npx tsc -p electron/tsconfig.json --noEmit` (0 errors), `npx prisma generate` after schema changes, dev-server smoke (login 200). No test framework.

## Task A: Core — models, provider abstraction, S3 + WebDAV
- `npm i @aws-sdk/client-s3 webdav`
- Prisma: `StorageProvider { id String @id @default(uuid()), name String, type String, configJson String, createdAt, updatedAt }`; Collection += `storageProviderId String?`, `remotePrefix String?`; Script += `remoteEtag String?`, `remoteSyncedAt DateTime?`. Migration via `prisma migrate dev --name cloud_storage`.
- `src/lib/storage/types.ts` (StorageProviderClient interface, RemoteFile, provider config types), `s3Provider.ts`, `webdavProvider.ts`, `index.ts` (factory by type; gcs = s3 client with https://storage.googleapis.com endpoint).
- Secrets at rest: AES-256-GCM helper in `src/lib/storage/secretBox.ts` keyed from `DESKTOP_AUTH_SECRET`/`AUTH_SECRET` env (both modes have one); configJson stored encrypted.
- CRUD + test: web routes `src/app/api/storage-providers/route.ts` (+ `[id]`, `[id]/test`); desktop IPC handlers in `electron/desktopRuntime.ts` (`scriptmanager:runtime:list/save/delete/test-storage-provider`) + preload + electron.d.ts + `src/lib/storageRuntimeClient.ts` (IPC-vs-HTTP, mirroring scriptsRuntimeClient style).

## Task B: Sync engine + run integration
- `src/lib/storage/syncService.ts`: `ensureFresh(scriptId)` (pull-on-run with etag check; unreachable → cached + flag), `pushScript(scriptId)` (push-on-save async), `syncCollection(collectionId)` (pull newer/push dirty, last-writer-wins + `.conflict-<ts>` copy), api-collection JSON doc export/import under `__api/`.
- Hook ensureFresh into BOTH run paths: web (`src/app/api/scripts/[id]/run` or wherever runScript executes) and desktop (`electron/desktopRuntime.ts` startLocalRun) + scheduler runs (schedulerService).
- Hook pushScript after save (web save route + desktop saveLocalScript) — fire-and-forget with audit/log line.
- Collection bind/unbind: extend collection update payloads with storageProviderId/remotePrefix; `storage:sync-collection` route + IPC.

## Task C: Settings redesign (Claude Desktop style)
- Rewrite `SettingsManager.tsx` into `src/components/settings/` — `SettingsLayout.tsx` (left nav rail: General, Appearance, Cloud Storage, GitHub Gist, Security, Desktop), section components extracted from current SettingsManager content (General=timeout/storage path/import-export, Appearance=theme picker cards, GitHub Gist=token+toggle, Security=password+API token, Desktop=notifications).
- `CloudStorageSection.tsx`: provider cards + Add/Edit dialog (type picker → per-type form fields), Test Connection, delete (guard: warn if collections bound).
- Token styling, 13px, accent active-section bar.

## Task D: Collection binding UI + sync status
- Collection context menu "Cloud storage…" → bind dialog (provider select, remote prefix, initial action push/pull); cloud badge on bound collections in ScriptTree; "Sync now" in context menu; toast + status-bar "Syncing…" transient.

## Task E: OAuth providers (GDrive + OneDrive, desktop-only)
- Electron loopback PKCE flow (`electron/oauthFlow.ts`): system browser + temporary 127.0.0.1 listener; tokens via `safeStorage` in userData; refresh handling.
- `gdriveProvider.ts` / `onedriveProvider.ts` via raw REST (drive/v3 files in folderId; Graph /me/drive/root:/path). Settings dialog: user-supplied Client ID + Connect button + connected-account label. Web mode: these types shown disabled with "Desktop only".
