import type { PrismaClient } from '@prisma/client'
import { validatePluginManifest, validatePluginSettings } from './manifest'
import { pluginSourceHash, verifyPluginSignature } from './signatures'

type InstallInput = { workspaceId: string; actorId: string; manifest: unknown; source: string; allowUnsigned?: boolean; signature?: string; publicKey?: string }
const view = (row: any) => ({ id: row.id, enabled: row.enabled, trusted: row.trusted, allowUnsigned: row.allowUnsigned, health: { status: row.healthStatus, message: row.healthMessage }, settings: JSON.parse(row.settingsJson), manifest: JSON.parse(row.package.manifestJson), signatureValid: row.package.signatureValid })

export function createPluginRegistry(database: PrismaClient) {
  const get = async (workspaceId: string, id: string) => {
    const row = await database.pluginInstallation.findFirst({ where: { id, workspaceId }, include: { package: true } })
    if (!row) throw new Error('plugin installation not found')
    return row
  }
  return {
    async install(input: InstallInput) {
      const manifest = validatePluginManifest(input.manifest)
      const signatureValid = verifyPluginSignature(manifest, input.source, input.signature, input.publicKey)
      if (!signatureValid && !input.allowUnsigned) throw new Error('unsigned plugin requires explicit local development opt-in')
      const sourceHash = pluginSourceHash(manifest, input.source)
      const pkg = await database.pluginPackage.upsert({ where: { pluginId_version_sourceHash: { pluginId: manifest.id, version: manifest.version, sourceHash } }, update: {}, create: { pluginId: manifest.id, version: manifest.version, manifestJson: JSON.stringify(manifest), source: input.source, sourceHash, signature: input.signature, publicKey: input.publicKey, signatureValid } })
      const row = await database.pluginInstallation.create({ data: { packageId: pkg.id, workspaceId: input.workspaceId, installedBy: input.actorId, allowUnsigned: Boolean(input.allowUnsigned) }, include: { package: true } })
      return view(row)
    },
    async list(workspaceId: string) { return (await database.pluginInstallation.findMany({ where: { workspaceId }, include: { package: true }, orderBy: { createdAt: 'desc' } })).map(view) },
    async trust(workspaceId: string, id: string) { await get(workspaceId, id); return view(await database.pluginInstallation.update({ where: { id }, data: { trusted: true }, include: { package: true } })) },
    async enable(workspaceId: string, id: string) { const row = await get(workspaceId, id); if (!row.trusted) throw new Error('plugin must be explicitly trusted'); return view(await database.pluginInstallation.update({ where: { id }, data: { enabled: true }, include: { package: true } })) },
    async disable(workspaceId: string, id: string) { await get(workspaceId, id); return view(await database.pluginInstallation.update({ where: { id }, data: { enabled: false }, include: { package: true } })) },
    async uninstall(workspaceId: string, id: string) { await get(workspaceId, id); await database.pluginInstallation.delete({ where: { id } }) },
    async updateSettings(workspaceId: string, id: string, settings: unknown) { const row = await get(workspaceId, id); const manifest = validatePluginManifest(JSON.parse(row.package.manifestJson)); const valid = validatePluginSettings(manifest, settings); return view(await database.pluginInstallation.update({ where: { id }, data: { settingsJson: JSON.stringify(valid) }, include: { package: true } })) },
    async setHealth(workspaceId: string, id: string, healthy: boolean, message?: string) { await get(workspaceId, id); return view(await database.pluginInstallation.update({ where: { id }, data: { healthStatus: healthy ? 'healthy' : 'unhealthy', healthMessage: message, lastCheckedAt: new Date() }, include: { package: true } })) },
    get,
  }
}
