import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureScriptsDirExists, getScriptFilePath } from '@/lib/scriptRunner'
import { syncScriptToGist } from '@/lib/gistService'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export async function GET() {
  const scripts = await prisma.script.findMany({
    orderBy: { name: 'asc' },
    include: { collection: true, tags: { include: { tag: true } } }
  })

  // Map to camelCase → snake_case for frontend compatibility
  const result = scripts.map(s => ({
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
    tags: s.tags.map(st => ({ id: st.tag.id, name: st.tag.name, color: st.tag.color })),
    timeout_ms: s.timeoutMs,
  }))

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const data = await req.json()
  const { id, name, content, sync_to_gist, language, interpreter, parameters, timeout_ms } = data

  // Serialize parameters to JSON string for storage
  let parametersJson = '[]'
  if (Array.isArray(parameters)) {
    try { parametersJson = JSON.stringify(parameters) } catch { parametersJson = '[]' }
  }

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  await ensureScriptsDirExists()

  let script = id ? await prisma.script.findUnique({ where: { id }, include: { collection: true } }) : null

  if (script) {
    // Update existing script
    const filename = script.filename
    const filePath = await getScriptFilePath(filename)

    if (content !== undefined) {
      fs.writeFileSync(filePath, content, 'utf8')

      // Snapshot version history (keep last 10)
      const MAX_VERSIONS = 10
      const latestVersion = await prisma.scriptVersion.findFirst({
        where: { scriptId: id },
        orderBy: { snapshotNumber: 'desc' },
        select: { snapshotNumber: true }
      })
      const nextSnapshotNumber = (latestVersion?.snapshotNumber ?? 0) + 1
      await prisma.scriptVersion.create({
        data: { scriptId: id!, content, snapshotNumber: nextSnapshotNumber }
      })
      // Prune old versions beyond the last MAX_VERSIONS
      const allVersions = await prisma.scriptVersion.findMany({
        where: { scriptId: id },
        orderBy: { snapshotNumber: 'desc' },
        select: { id: true }
      })
      if (allVersions.length > MAX_VERSIONS) {
        const toDelete = allVersions.slice(MAX_VERSIONS).map(v => v.id)
        await prisma.scriptVersion.deleteMany({ where: { id: { in: toDelete } } })
      }
    }

    script = await prisma.script.update({
      where: { id },
      data: {
        name,
        language: language ?? script.language,
        interpreter: language === 'custom' ? (interpreter ?? null) : null,
        syncToGist: sync_to_gist ?? script.syncToGist,
        parameters: parametersJson,
        timeoutMs: timeout_ms !== undefined ? (timeout_ms || null) : script.timeoutMs,
        updatedAt: new Date()
      },
      include: { collection: true }
    })
  } else {
    // Create new script
    const filename = name.endsWith('.py') || name.endsWith('.js') || name.endsWith('.sh')
      ? name
      : `${name}.py`

    const filePath = await getScriptFilePath(filename)

    // Check if name already taken
    const existing = await prisma.script.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ error: 'A script with this name already exists' }, { status: 409 })
    }

    // Check global settings for default Gist sync
    const globalGistSetting = await prisma.setting.findUnique({
      where: { key: 'gist_sync_enabled' }
    })
    const defaultSyncToGist = globalGistSetting?.value === 'true'

    const initialContent = content ?? '# New script\nprint("Hello World")\n'
    fs.writeFileSync(filePath, initialContent, 'utf8')

    script = await prisma.script.create({
      data: {
        name,
        filename,
        language: language ?? 'python',
        interpreter: language === 'custom' ? (interpreter ?? null) : null,
        syncToGist: sync_to_gist ?? defaultSyncToGist,
        parameters: parametersJson,
        webhookToken: uuidv4().replace(/-/g, '')
      },
      include: { collection: true }
    })
  }

  // Sync to GitHub Gist if enabled
  if (script.syncToGist && content !== undefined) {
    try {
      await syncScriptToGist(script, content ?? '')
      script = await prisma.script.findUnique({ where: { id: script.id }, include: { collection: true } }) ?? script
    } catch (err) {
      // Non-fatal - log and continue
      console.error('[Gist] Sync failed:', err)
    }
  }

  return NextResponse.json({
    id: script.id,
    name: script.name,
    filename: script.filename,
    description: script.description,
    language: script.language,
    interpreter: script.interpreter,
    parameters: (() => { try { return JSON.parse(script.parameters ?? '[]') } catch { return [] } })(),
    created_at: script.createdAt.toISOString(),
    updated_at: script.updatedAt.toISOString(),
    last_run: script.lastRun?.toISOString() ?? null,
    webhook_token: script.webhookToken,
    schedule_cron: script.scheduleCron,
    schedule_enabled: script.scheduleEnabled,
    collection_id: script.collectionId,
    gist_id: script.gistId,
    gist_url: script.gistUrl,
    sync_to_gist: script.syncToGist,
    timeout_ms: script.timeoutMs,
  })
}
