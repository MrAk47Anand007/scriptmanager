export interface InstalledRelease { appVersion: string; schemaVersion: number }
export interface TargetRelease { appVersion: string; minSchemaVersion: number; maxSchemaVersion: number }
function parts(version: string) { if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) throw new Error(`Invalid release version: ${version}`); return version.split(/[+-]/, 1)[0].split('.').map(Number) }
function compare(left: string, right: string) { const a = parts(left), b = parts(right); for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }
export function assertUpgradeCompatible(installed: InstalledRelease, target: TargetRelease) {
  if (compare(target.appVersion, installed.appVersion) < 0) throw new Error(`Release downgrade from ${installed.appVersion} to ${target.appVersion} is not supported`)
  if (installed.schemaVersion < target.minSchemaVersion || installed.schemaVersion > target.maxSchemaVersion) throw new Error(`Database schema version ${installed.schemaVersion} is not supported by ${target.appVersion}`)
  return { compatible: true as const }
}
