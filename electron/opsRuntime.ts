import { PrismaClient } from '@prisma/client'
import { Client as SshClient, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { EventEmitter } from 'events'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { buildRemoteChmodCommand, buildRemoteCommand, normalizeFilePermissions, normalizeRemotePath } from '../src/lib/executionSafety'
import { hasStoredOpsSecret, revealOpsSecret } from '../src/lib/opsSecretStore'
import { resolveResourceSecret, storeResourceSecret } from '../src/lib/secrets/migration'
import { createDesktopActorContext } from '../src/lib/runtime/trustedContext'
import { getDesktopWorkspaceLayout } from '../src/lib/workspaceLayout'
import { parseWorkspacePolicy } from '../src/lib/git/policy'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

const remoteExecEmitters = new Map<string, EventEmitter>()

type ProjectDto = {
  id: string
  name: string
  description: string
  environment: 'development' | 'qa' | 'uat' | 'production'
  color: string
  repository_root: string | null
  default_branch: string
  remote_url: string | null
  workspace_policy: import('../src/lib/git/types').WorkspacePolicy
  collection_ids: string[]
  created_at: string
  updated_at: string
}

type ServerProfileDto = {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_method: 'password' | 'key'
  has_secret: boolean
  key_path: string | null
  project_id: string | null
  notes: string
  created_at: string
  updated_at: string
}

type RemoteExecutionRecordDto = {
  id: string
  script_id: string
  profile_id: string
  script_name: string
  profile_name: string
  server_host: string
  status: 'pending_approval' | 'approved' | 'rejected' | 'running' | 'success' | 'failure'
  triggered_by: string
  approved_by: string | null
  remote_path: string | null
  exit_code: number | null
  log_output: string | null
  param_values: string
  requested_at: string
  approved_at: string | null
  started_at: string | null
  finished_at: string | null
}

function serializeProject(project: any): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    environment: project.environment,
    color: project.color,
    repository_root: project.repositoryRoot ?? null,
    default_branch: project.defaultBranch ?? 'main',
    remote_url: project.remoteUrl ?? null,
    workspace_policy: parseWorkspacePolicy(project.workspacePolicy),
    collection_ids: project.collections?.map((collection: any) => collection.id) ?? [],
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  }
}

function serializeProfile(profile: any): ServerProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    auth_method: profile.authMethod,
    has_secret: hasStoredOpsSecret(profile.encryptedSecret),
    key_path: profile.keyPath,
    project_id: profile.projectId ?? null,
    notes: profile.notes,
    created_at: profile.createdAt.toISOString(),
    updated_at: profile.updatedAt.toISOString(),
  }
}

function serializeRemoteExecution(execution: any): RemoteExecutionRecordDto {
  return {
    id: execution.id,
    script_id: execution.scriptId,
    profile_id: execution.profileId,
    script_name: execution.scriptName,
    profile_name: execution.profileName,
    server_host: execution.serverHost,
    status: execution.status,
    triggered_by: execution.triggeredBy,
    approved_by: execution.approvedBy,
    remote_path: execution.remotePath,
    exit_code: execution.exitCode,
    log_output: execution.logOutput,
    param_values: execution.paramValues,
    requested_at: execution.requestedAt.toISOString(),
    approved_at: execution.approvedAt?.toISOString() ?? null,
    started_at: execution.startedAt?.toISOString() ?? null,
    finished_at: execution.finishedAt?.toISOString() ?? null,
  }
}

async function getWorkspaceRoot() {
  const setting = await prisma.setting.findUnique({ where: { key: 'script_storage_path' } })
  return getDesktopWorkspaceLayout(
    path.resolve(setting?.value?.trim() || process.env.SCRIPTS_DIR || path.join(process.cwd(), 'user_scripts'))
  ).scriptsRoot
}

async function resolveScriptPath(scriptId: string, workspaceId: string) {
  const script = await prisma.script.findFirst({
    where: { id: scriptId, workspaceId },
    select: {
      id: true,
      filename: true,
      sourcePath: true,
      collection: { select: { folderPath: true } },
    },
  })
  if (!script) {
    throw new Error('Script not found')
  }
  if (script.sourcePath) return path.resolve(script.sourcePath)
  if (script.collection?.folderPath) return path.resolve(script.collection.folderPath, path.basename(script.filename))
  return path.resolve(await getWorkspaceRoot(), path.basename(script.filename))
}

async function buildConnectConfig(profileId: string, workspaceId = 'default'): Promise<ConnectConfig> {
  const profile = await prisma.serverProfile.findFirst({ where: { id: profileId, workspaceId } })
  if (!profile) throw new Error(`Server profile not found: ${profileId}`)

  const config: ConnectConfig = {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    readyTimeout: 15000,
  }

  if (profile.authMethod === 'key') {
    if (!profile.keyPath) throw new Error('Key path is required for key-based authentication')
    config.privateKey = fs.readFileSync(profile.keyPath)
  } else if (profile.encryptedSecret) {
    config.password = profile.encryptedSecret.startsWith('secretref:')
      ? await resolveResourceSecret(prisma, profile.encryptedSecret, { resourceType: 'server-profile', resourceId: profile.id, field: 'password', workspaceId }, 'desktop-ssh-runtime') ?? undefined
      : await revealOpsSecret(profile.encryptedSecret) ?? undefined
  }

  return config
}

function createSshClient(config: ConnectConfig): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const client = new SshClient()
    client.once('ready', () => resolve(client))
    client.once('error', (error) => reject(error))
    client.connect(config)
  })
}

function execCommand(client: SshClient, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) return reject(error)
      const chunks: Buffer[] = []
      stream.on('data', (data: Buffer) => chunks.push(data))
      stream.stderr.on('data', (data: Buffer) => chunks.push(data))
      stream.on('close', () => resolve(Buffer.concat(chunks).toString()))
      stream.on('error', reject)
    })
  })
}

async function executeRemote(profileId: string, command: string, remoteExecId: string, workspaceId: string): Promise<void> {
  const emitter = remoteExecEmitters.get(remoteExecId) ?? new EventEmitter()
  remoteExecEmitters.set(remoteExecId, emitter)

  await prisma.remoteExecution.update({
    where: { id: remoteExecId },
    data: { status: 'running', startedAt: new Date() },
  }).catch(() => undefined)

  let client: SshClient | null = null
  const outputLines: string[] = []
  let exitCode = 1

  try {
    const config = await buildConnectConfig(profileId, workspaceId)
    client = await createSshClient(config)

    await new Promise<void>((resolve, reject) => {
      client!.exec(command, (error, stream) => {
        if (error) return reject(error)

        stream.on('data', (data: Buffer) => {
          const line = data.toString()
          outputLines.push(line)
          emitter.emit('line', line)
        })

        stream.stderr.on('data', (data: Buffer) => {
          const line = data.toString()
          outputLines.push(line)
          emitter.emit('line', line)
        })

        stream.on('close', (code: number | null) => {
          exitCode = code ?? 1
          emitter.emit('done', exitCode)
          resolve()
        })

        stream.on('error', (streamError: Error) => reject(streamError))
      })
    })

    await prisma.remoteExecution.update({
      where: { id: remoteExecId },
      data: {
        status: exitCode === 0 ? 'success' : 'failure',
        exitCode,
        finishedAt: new Date(),
        logOutput: outputLines.join('').slice(0, 100000),
      },
    }).catch(() => undefined)
  } catch (error) {
    const errorMessage = `\n[Error] ${error instanceof Error ? error.message : String(error)}\n`
    outputLines.push(errorMessage)
    emitter.emit('line', errorMessage)
    emitter.emit('done', 1)
    await prisma.remoteExecution.update({
      where: { id: remoteExecId },
      data: {
        status: 'failure',
        exitCode: 1,
        finishedAt: new Date(),
        logOutput: outputLines.join('').slice(0, 100000),
      },
    }).catch(() => undefined)
  } finally {
    client?.end()
    remoteExecEmitters.delete(remoteExecId)
  }
}

export function getRemoteExecEmitter(remoteExecId: string) {
  return remoteExecEmitters.get(remoteExecId)
}

export async function listProjects(): Promise<ProjectDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const projects = await prisma.project.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { name: 'asc' },
    include: { collections: { select: { id: true } } },
  })
  return projects.map(serializeProject)
}

export async function saveProject(payload: {
  id?: string
  name?: string
  description?: string
  environment?: string
  color?: string
  repository_root?: string | null
  default_branch?: string
  remote_url?: string | null
  workspace_policy?: import('../src/lib/git/types').WorkspacePolicy
}) {
  const actor = await createDesktopActorContext(prisma)
  const validEnvironments = ['development', 'qa', 'uat', 'production']
  const environment = validEnvironments.includes(payload.environment ?? '') ? payload.environment! : 'development'
  if (!payload.id && !payload.name?.trim()) {
    throw new Error('Name is required')
  }
  if (payload.id) {
    const existing = await prisma.project.findFirst({ where: { id: payload.id, workspaceId: actor.workspaceId } })
    if (!existing) throw new Error('Project not found')
  }
  const project = payload.id
    ? await prisma.project.update({
      where: { id: payload.id },
      data: {
        ...(payload.name !== undefined && { name: payload.name.trim() }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.environment !== undefined && { environment }),
        ...(payload.color !== undefined && { color: payload.color }),
        ...(payload.repository_root !== undefined && { repositoryRoot: payload.repository_root?.trim() || null }),
        ...(payload.default_branch !== undefined && { defaultBranch: payload.default_branch.trim() || 'main' }),
        ...(payload.remote_url !== undefined && { remoteUrl: payload.remote_url?.trim() || null }),
        ...(payload.workspace_policy !== undefined && { workspacePolicy: JSON.stringify(payload.workspace_policy) }),
      },
      include: { collections: { select: { id: true } } },
    })
    : await prisma.project.create({
      data: {
        workspaceId: actor.workspaceId,
        name: payload.name!.trim(),
        description: payload.description ?? '',
        environment,
        color: payload.color ?? '#6366f1',
        repositoryRoot: payload.repository_root?.trim() || null,
        defaultBranch: payload.default_branch?.trim() || 'main',
        remoteUrl: payload.remote_url?.trim() || null,
        workspacePolicy: JSON.stringify(payload.workspace_policy ?? {}),
      },
      include: { collections: { select: { id: true } } },
    })
  return serializeProject(project)
}

export async function deleteProject(id: string) {
  const actor = await createDesktopActorContext(prisma)
  const result = await prisma.project.deleteMany({ where: { id, workspaceId: actor.workspaceId } })
  if (result.count === 0) throw new Error('Project not found')
  return id
}

export async function assignCollectionToProject(collectionId: string, projectId: string | null) {
  const actor = await createDesktopActorContext(prisma)
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId } })
    if (!project) throw new Error('Project not found')
  }
  await prisma.collection.update({
    where: { id: collectionId },
    data: { projectId },
  })
  return { collectionId, projectId }
}

export async function listServerProfiles(): Promise<ServerProfileDto[]> {
  const actor = await createDesktopActorContext(prisma)
  const profiles = await prisma.serverProfile.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { name: 'asc' } })
  return profiles.map(serializeProfile)
}

export async function saveServerProfile(payload: {
  id?: string
  name?: string
  host?: string
  port?: number
  username?: string
  auth_method?: string
  secret?: string
  key_path?: string | null
  project_id?: string | null
  notes?: string
}) {
  const actor = await createDesktopActorContext(prisma)
  if (!payload.id && (!payload.name?.trim() || !payload.host?.trim() || !payload.username?.trim())) {
    throw new Error('Name, host, and username are required')
  }
  if (payload.project_id) {
    const project = await prisma.project.findFirst({ where: { id: payload.project_id, workspaceId: actor.workspaceId } })
    if (!project) throw new Error('Project not found')
  }
  const profileId = payload.id ?? crypto.randomUUID()
  if (payload.id) {
    const existing = await prisma.serverProfile.findFirst({ where: { id: payload.id, workspaceId: actor.workspaceId } })
    if (!existing) throw new Error('Server profile not found')
  }
  let encryptedSecretJson: string | null | undefined
  if (payload.secret !== undefined) {
    if (!payload.secret) {
      encryptedSecretJson = null
    } else {
      encryptedSecretJson = await storeResourceSecret(prisma, { resourceType: 'server-profile', resourceId: profileId, field: 'password', name: `ops:${profileId}:password`, workspaceId: actor.workspaceId }, payload.secret, actor.actorId)
    }
  }

  const profile = payload.id
    ? await prisma.serverProfile.update({
      where: { id: payload.id },
      data: {
        ...(payload.name !== undefined && { name: payload.name.trim() }),
        ...(payload.host !== undefined && { host: payload.host.trim() }),
        ...(payload.port !== undefined && { port: payload.port }),
        ...(payload.username !== undefined && { username: payload.username.trim() }),
        ...(payload.auth_method !== undefined && { authMethod: payload.auth_method }),
        ...(encryptedSecretJson !== undefined && { encryptedSecret: encryptedSecretJson }),
        ...(payload.key_path !== undefined && { keyPath: payload.key_path }),
        ...(payload.project_id !== undefined && { projectId: payload.project_id }),
        ...(payload.notes !== undefined && { notes: payload.notes }),
      },
    })
    : await prisma.serverProfile.create({
      data: {
        id: profileId,
        name: payload.name!.trim(),
        host: payload.host!.trim(),
        port: payload.port ?? 22,
        username: payload.username!.trim(),
        authMethod: payload.auth_method ?? 'password',
        encryptedSecret: encryptedSecretJson ?? null,
        keyPath: payload.key_path ?? null,
        projectId: payload.project_id ?? null,
        notes: payload.notes ?? '',
        workspaceId: actor.workspaceId,
      },
    })

  return serializeProfile(profile)
}

export async function deleteServerProfile(id: string) {
  const actor = await createDesktopActorContext(prisma)
  const result = await prisma.serverProfile.deleteMany({ where: { id, workspaceId: actor.workspaceId } })
  if (result.count === 0) throw new Error('Server profile not found')
  return id
}

export async function testConnection(profileId: string) {
  const actor = await createDesktopActorContext(prisma)
  const start = Date.now()
  let client: SshClient | null = null
  try {
    const config = await buildConnectConfig(profileId, actor.workspaceId)
    client = await createSshClient(config)
    return { success: true, latency_ms: Date.now() - start }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    client?.end()
  }
}

export async function transferScript(payload: { profileId: string; scriptId: string; remotePath: string; permissions?: string }) {
  const actor = await createDesktopActorContext(prisma)
  let remotePath: string
  let permissions: string
  try {
    remotePath = normalizeRemotePath(payload.remotePath)
    permissions = normalizeFilePermissions(payload.permissions)
  } catch (error) {
    return { success: false, remote_path: '', error: error instanceof Error ? error.message : String(error) }
  }
  const profile = await prisma.serverProfile.findFirst({ where: { id: payload.profileId, workspaceId: actor.workspaceId } })
  const script = await prisma.script.findFirst({ where: { id: payload.scriptId, workspaceId: actor.workspaceId } })
  if (!profile) {
    return { success: false, remote_path: '', error: 'Server profile not found' }
  }
  if (!script) {
    return { success: false, remote_path: '', error: 'Script not found' }
  }

  const localPath = await resolveScriptPath(payload.scriptId, actor.workspaceId)
  const remoteFilePath = (remotePath.endsWith('/') ? remotePath : `${remotePath}/`) + script.filename

  let client: SshClient | null = null
  try {
    const config = await buildConnectConfig(payload.profileId, actor.workspaceId)
    client = await createSshClient(config)

    await new Promise<void>((resolve, reject) => {
      client!.sftp((error: Error | undefined, sftp: SFTPWrapper) => {
        if (error) return reject(error)
        const readStream = fs.createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remoteFilePath)
        writeStream.on('close', () => {
          sftp.end()
          resolve()
        })
        writeStream.on('error', (streamError: Error) => {
          sftp.end()
          reject(streamError)
        })
        readStream.pipe(writeStream)
      })
    })

    await execCommand(client, buildRemoteChmodCommand(remoteFilePath, permissions))
    return { success: true, remote_path: remoteFilePath }
  } catch (error) {
    return {
      success: false,
      remote_path: remoteFilePath,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    client?.end()
  }
}

export async function startRemoteExec(payload: { profileId: string; scriptId: string; remotePath?: string; paramValues?: Record<string, string> }) {
  const actor = await createDesktopActorContext(prisma)
  const scopedProfile = await prisma.serverProfile.findFirst({
    where: { id: payload.profileId, workspaceId: actor.workspaceId },
    include: { project: true },
  })
  const script = await prisma.script.findFirst({ where: { id: payload.scriptId, workspaceId: actor.workspaceId } })
  if (!scopedProfile) throw new Error('Server profile not found')
  if (!script) throw new Error('Script not found')

  const remoteExecId = crypto.randomUUID()
  const environment = scopedProfile.project?.environment ?? 'development'
  const requiresApproval = environment === 'production' || environment === 'uat'

  await prisma.remoteExecution.create({
    data: {
      id: remoteExecId,
      scriptId: payload.scriptId,
      profileId: payload.profileId,
      scriptName: script.name,
      profileName: scopedProfile.name,
      serverHost: scopedProfile.host,
      status: requiresApproval ? 'pending_approval' : 'approved',
      remotePath: payload.remotePath ?? null,
      paramValues: payload.paramValues ? JSON.stringify(payload.paramValues) : '{}',
    },
  })

  if (!requiresApproval) {
    remoteExecEmitters.set(remoteExecId, new EventEmitter())
    const command = buildRemoteCommand(script.filename, payload.remotePath, payload.paramValues)
    void executeRemote(payload.profileId, command, remoteExecId, actor.workspaceId)
  }

  return {
    remote_exec_id: remoteExecId,
    requires_approval: requiresApproval,
    environment,
  }
}

export async function approveExecution(id: string, approverName: string) {
  const execution = await prisma.remoteExecution.findUnique({ where: { id }, include: { profile: true } })
  if (!execution) throw new Error('Remote execution not found')
  if (execution.status !== 'pending_approval') throw new Error(`Cannot approve execution with status: ${execution.status}`)

  await prisma.remoteExecution.update({
    where: { id },
    data: {
      status: 'approved',
      approvedBy: approverName.trim(),
      approvedAt: new Date(),
    },
  })

  const script = await prisma.script.findFirst({ where: { id: execution.scriptId, workspaceId: execution.profile.workspaceId } })
  if (!script) throw new Error('Script not found')
  remoteExecEmitters.set(id, new EventEmitter())
  const paramValues = execution.paramValues ? JSON.parse(execution.paramValues) : {}
  const command = buildRemoteCommand(script.filename, execution.remotePath ?? undefined, paramValues as Record<string, string>)
  void executeRemote(execution.profileId, command, id, execution.profile.workspaceId)
  return id
}

export async function rejectExecution(id: string) {
  const execution = await prisma.remoteExecution.findUnique({ where: { id } })
  if (!execution) throw new Error('Remote execution not found')
  if (execution.status !== 'pending_approval') throw new Error(`Cannot reject execution with status: ${execution.status}`)
  await prisma.remoteExecution.update({
    where: { id },
    data: { status: 'rejected', finishedAt: new Date() },
  })
  return id
}

export async function listAuditLog(params?: { profileId?: string; scriptId?: string; limit?: number; offset?: number }) {
  const actor = await createDesktopActorContext(prisma)
  const where = {
    profile: { workspaceId: actor.workspaceId },
    ...(params?.profileId ? { profileId: params.profileId } : {}),
    ...(params?.scriptId ? { scriptId: params.scriptId } : {}),
  }
  const [executions, total] = await Promise.all([
    prisma.remoteExecution.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: Math.min(params?.limit ?? 50, 200),
      skip: params?.offset ?? 0,
    }),
    prisma.remoteExecution.count({ where }),
  ])

  return { total, executions: executions.map(serializeRemoteExecution) }
}
