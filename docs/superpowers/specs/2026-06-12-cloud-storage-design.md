# Cloud Storage Integration + Settings Redesign — Design Spec

**Date:** 2026-06-12
**Status:** Approved direction (all providers incl. GDrive/OneDrive; per-collection binding; full settings redesign)

## Goal

Extend ScriptManager's storage beyond local disk + GitHub Gist: collections can bind to a cloud storage remote (AWS S3 / any S3-compatible self-hosted cloud / Google Cloud Storage / WebDAV (Nextcloud, ownCloud) / Google Drive / OneDrive). Scripts and API collections stored remotely are pulled to the local workspace on demand (pull-on-run with cache) and pushed on save. Settings UI is redesigned Claude-Desktop-style with a left section nav, and Cloud Storage gets its own section.

## Architecture

### 1. Provider abstraction (`src/lib/storage/`)

```ts
interface StorageProviderClient {
  test(): Promise<{ ok: boolean; error?: string }>
  list(prefix: string): Promise<RemoteFile[]>        // { path, etag, size, modifiedAt }
  pull(remotePath: string): Promise<Buffer>
  push(remotePath: string, content: Buffer): Promise<{ etag: string }>
  remove(remotePath: string): Promise<void>
}
```

Implementations:
- `s3.ts` — @aws-sdk/client-s3; config { endpoint?, region, bucket, accessKeyId, secretAccessKey, prefix }. Covers AWS, MinIO, Ceph, Wasabi, GCS-interop — the "enterprise self-hosted" answer.
- `webdav.ts` — `webdav` npm package; config { baseUrl, username, password, prefix }. Covers Nextcloud/ownCloud/generic DAV.
- `gcs.ts` — S3 client against GCS XML interop endpoint (no new dependency) OR HMAC keys; config like s3 with fixed endpoint.
- `gdrive.ts` — raw REST (drive/v3) with OAuth tokens; config { clientId, folderId }. User supplies their own OAuth Client ID (desktop app type).
- `onedrive.ts` — raw REST (MS Graph) with OAuth tokens; config { clientId, folderPath }.

### 2. OAuth (desktop)

Electron main process: loopback flow — open system browser to provider consent URL with `redirect_uri=http://127.0.0.1:<port>/oauth/callback`, temporary local HTTP listener captures the code, exchanges for tokens (PKCE, no client secret). Tokens encrypted with Electron `safeStorage` and kept in userData. Web mode: OAuth providers shown as "desktop only" (loopback not available behind arbitrary hosting); S3/WebDAV/GCS work in both modes.

### 3. Data model (Prisma)

- `StorageProvider { id, name, type (s3|gcs|webdav|gdrive|onedrive), configJson (secrets encrypted at rest via safeStorage in desktop / AES with DESKTOP secret in web), createdAt, updatedAt }`
- `Collection` gains `storageProviderId?`, `remotePrefix?` (path/folder within the provider).
- `Script` gains `remoteEtag?`, `remoteSyncedAt?` (cache validity).
- API collections: exported as a JSON document per collection to the same remote prefix (`__api/<collection>.json`) — same pull/push machinery.

### 4. Sync engine (`src/lib/storage/syncService.ts`, runs server-side / desktop main)

- **Pull-on-run:** before executing a script in a cloud-bound collection: HEAD/list the remote file; if etag ≠ `remoteEtag`, pull to the existing workspace path and update etag. If remote unreachable → run cached copy with a warning toast ("running cached version").
- **Push-on-save:** after a successful local save in a bound collection, push async; update etag; failure → toast + retry on next save.
- **Manual sync:** "Sync now" per collection (pull all newer + push all dirty). Conflict rule v1: last-writer-wins by modifiedAt, with the losing version saved as a `.conflict-<ts>` sibling — no merge UI.
- IPC + web routes: `storage:list-providers/save/delete/test`, `storage:sync-collection`, `storage:oauth-start` (desktop only).

### 5. UI

- **Settings redesign (Claude Desktop style):** left nav rail inside the settings page — sections: General (timeout, storage path, import/export), Appearance (theme), Cloud Storage (provider list + add/edit + test), GitHub Gist (existing), Security (password, API token), Desktop (notifications; desktop-only). Each section a clean card page; active section highlighted with accent bar; 13px, token styling.
- **Cloud Storage section:** provider cards (type icon, name, status dot from last test, bound-collections count), "Add provider" dialog with type picker → per-type form, Test Connection button, OAuth "Connect" button for gdrive/onedrive (desktop).
- **Collection binding:** collection context menu → "Cloud storage…" dialog: pick provider + remote prefix, initial action (push local / pull remote / merge), sync status row. Cloud-bound collections get a small cloud badge in the tree; per-script sync state dot (synced / dirty / pulling).
- **Status bar:** transient "Syncing…" indicator while pull/push runs.

### 6. Scope decisions

- Conflict resolution v1 = last-writer-wins + conflict copy. No three-way merge.
- GDrive/OneDrive require user-supplied OAuth Client ID; documented in the dialog with a help link. Desktop-only in v1.
- Webhook/scheduled runs also use pull-on-run (sync service lives server-side, shared).
- Gist sync remains as-is (separate, per-script).

## Phasing

1. Core: provider abstraction + S3 + WebDAV, Prisma models, sync service, pull-on-run/push-on-save, IPC/routes.
2. Settings redesign + Cloud Storage UI + collection binding UI.
3. GCS + OAuth providers (GDrive, OneDrive).
