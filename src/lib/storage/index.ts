import { decryptString, encryptString } from './secretBox'
import { createS3Provider } from './s3Provider'
import { createWebdavProvider } from './webdavProvider'
import type { ProviderType, S3Config, StorageProviderClient, WebdavConfig } from './types'

export * from './types'
export { encryptString, decryptString } from './secretBox'

const GCS_INTEROP_ENDPOINT = 'https://storage.googleapis.com'

export function createProviderClient(
  type: ProviderType,
  decryptedConfig: Record<string, unknown>
): StorageProviderClient {
  switch (type) {
    case 's3':
      return createS3Provider(decryptedConfig as S3Config)
    case 'gcs':
      return createS3Provider({
        ...(decryptedConfig as S3Config),
        endpoint: GCS_INTEROP_ENDPOINT,
        forcePathStyle: true,
      })
    case 'webdav':
      return createWebdavProvider(decryptedConfig as unknown as WebdavConfig)
    case 'gdrive':
    case 'onedrive':
      throw new Error(`Storage provider type '${type}' is not yet implemented`)
    default:
      throw new Error(`Unknown storage provider type '${type as string}'`)
  }
}

export function serializeProviderConfig(config: Record<string, unknown>): string {
  return encryptString(JSON.stringify(config))
}

export function deserializeProviderConfig(encrypted: string): Record<string, unknown> {
  return JSON.parse(decryptString(encrypted)) as Record<string, unknown>
}
