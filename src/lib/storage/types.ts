export interface RemoteFile {
  path: string
  etag: string
  size: number
  modifiedAt: string
}

export interface StorageProviderClient {
  test(): Promise<{ ok: boolean; error?: string; latencyMs?: number }>
  list(prefix: string): Promise<RemoteFile[]>
  pull(remotePath: string): Promise<Buffer>
  push(remotePath: string, content: Buffer): Promise<{ etag: string }>
  remove(remotePath: string): Promise<void>
}

export type S3Config = {
  endpoint?: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

export type WebdavConfig = {
  baseUrl: string
  username: string
  password: string
}

export type GdriveConfig = {
  clientId: string
  refreshToken: string
  /** Google Drive folder id to sync into; defaults to the Drive root. */
  folderId?: string
}

export type OnedriveConfig = {
  clientId: string
  refreshToken: string
  /** Folder path under /drive/root:, e.g. 'ScriptManager'; defaults to the drive root. */
  folderPath?: string
}

export type ProviderType = 's3' | 'gcs' | 'webdav' | 'gdrive' | 'onedrive'
