export interface RecoverableNode { id: string; status: string; resumable: boolean }
export interface BackupManifest { format: number; database: string; sha256: string; bytes: number }
export function planInterruptedRunRecovery(nodes: RecoverableNode[]) {
  const plan = { resume: [] as string[], interrupt: [] as string[], preserve: [] as string[] }
  for (const node of nodes) { if (node.status !== 'running') plan.preserve.push(node.id); else if (node.resumable) plan.resume.push(node.id); else plan.interrupt.push(node.id) }
  return plan
}
export function validateBackupManifest(manifest: BackupManifest, databaseName: string, sha256: string, bytes: number) {
  if (manifest.format !== 1) throw new Error(`Unsupported backup format ${manifest.format}`)
  if (manifest.database !== databaseName) throw new Error('Backup database name does not match its manifest')
  if (manifest.sha256 !== sha256) throw new Error('Backup checksum does not match its manifest')
  if (manifest.bytes !== bytes) throw new Error('Backup size does not match its manifest')
  return true
}
