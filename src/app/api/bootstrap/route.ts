import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cache } from '@/lib/cache'

/**
 * Bootstrap endpoint — returns scripts, collections, and settings in a single round-trip.
 * Replaces three separate fetches on app startup, reducing latency by ~2 HTTP round-trips.
 */
export async function GET() {
    const [cachedScripts, cachedSettings] = await Promise.all([
        cache.get('all_scripts'),
        cache.get('settings'),
    ])

    const [scripts, collections, settings] = await Promise.all([
        // Scripts (with cache)
        cachedScripts
            ? Promise.resolve(cachedScripts)
            : prisma.script.findMany({
                orderBy: { name: 'asc' },
                include: { collection: true, tags: { include: { tag: true } } },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }).then((rows: any[]) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = rows.map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    filename: s.filename,
                    description: s.description,
                    language: s.language,
                    interpreter: s.interpreter,
                    parameters: (() => { try { return JSON.parse(s.parameters ?? '[]') } catch { return [] } })(),
                    created_at: s.createdAt.toISOString(),
                    updated_at: s.updatedAt.toISOString(),
                    last_run: s.lastRun?.toISOString() ?? null,
                    webhook_token: s.webhookToken,
                    schedule_cron: s.scheduleCron,
                    schedule_enabled: s.scheduleEnabled,
                    collection_id: s.collectionId,
                    gist_id: s.gistId,
                    gist_url: s.gistUrl,
                    sync_to_gist: s.syncToGist,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tags: s.tags.map((st: any) => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color })),
                    timeout_ms: s.timeoutMs,
                    require_webhook_signature: s.requireWebhookSignature,
                    webhook_secret_set: !!s.webhookSecret,
                    source_path: s.sourcePath,
                }))
                void cache.set('all_scripts', result, 60 * 5)
                return result
            }),

        // Collections (no cache — small table, always fresh)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma.collection.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { scripts: true } } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).then((rows: any[]) => rows.map((c: any) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            script_count: c._count.scripts,
            project_id: c.projectId ?? null,
            folder_path: c.folderPath ?? null,
            is_temporary: c.isTemporary,
            created_at: c.createdAt.toISOString(),
        }))),

        // Settings (with cache)
        cachedSettings
            ? Promise.resolve(cachedSettings)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            : prisma.setting.findMany().then((rows: any[]) => {
                const result: Record<string, string> = {}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const s of rows as any[]) {
                    if (s.value !== null) result[s.key] = s.value
                }
                void cache.set('settings', result, 60 * 60)
                return result
            }),
    ])

    return NextResponse.json({ scripts, collections, settings })
}
