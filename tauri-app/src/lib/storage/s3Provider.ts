import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import type { Readable } from 'stream'
import type { RemoteFile, S3Config, StorageProviderClient } from './types'

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0)
  // AWS SDK v3 in Node returns a Readable; in other runtimes it may expose transformToByteArray.
  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> }
  if (typeof maybeTransform.transformToByteArray === 'function') {
    return Buffer.from(await maybeTransform.transformToByteArray())
  }
  const stream = body as Readable
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function normalizeEtag(etag: string | undefined): string {
  return (etag ?? '').replace(/"/g, '')
}

export function createS3Provider(config: S3Config): StorageProviderClient {
  const client = new S3Client({
    region: config.region || 'us-east-1',
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  return {
    async test() {
      const startedAt = Date.now()
      try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
        return { ok: true, latencyMs: Date.now() - startedAt }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startedAt,
        }
      }
    },

    async list(prefix: string): Promise<RemoteFile[]> {
      const files: RemoteFile[] = []
      let continuationToken: string | undefined
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        )
        for (const item of response.Contents ?? []) {
          if (!item.Key) continue
          files.push({
            path: item.Key,
            etag: normalizeEtag(item.ETag),
            size: item.Size ?? 0,
            modifiedAt: item.LastModified?.toISOString() ?? new Date(0).toISOString(),
          })
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
      } while (continuationToken)
      return files
    },

    async pull(remotePath: string): Promise<Buffer> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: remotePath })
      )
      return streamToBuffer(response.Body)
    },

    async push(remotePath: string, content: Buffer): Promise<{ etag: string }> {
      const response = await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: remotePath, Body: content })
      )
      return { etag: normalizeEtag(response.ETag) }
    },

    async remove(remotePath: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: remotePath }))
    },
  }
}
