import { Client as SshClient, ConnectConfig, SFTPWrapper } from 'ssh2'
import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { prisma } from './db'
import { getEncryptionKey, decryptSecret, EncryptedPayload } from './crypto'
import { getScriptResolvedFilePath } from './scriptRunner'

// Module-level map: remoteExecId -> EventEmitter (mirrors buildEmitters in scriptRunner.ts)
const remoteExecEmitters = new Map<string, EventEmitter>()

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildConnectConfig(profileId: string): Promise<ConnectConfig> {
    const profile = await prisma.serverProfile.findUnique({ where: { id: profileId } })
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
    } else {
        // Password auth — decrypt stored secret
        if (profile.encryptedSecret) {
            const key = await getEncryptionKey()
            const payload = JSON.parse(profile.encryptedSecret) as EncryptedPayload
            config.password = decryptSecret(payload, key)
        }
    }

    return config
}

function createSshClient(config: ConnectConfig): Promise<SshClient> {
    return new Promise((resolve, reject) => {
        const client = new SshClient()

        client.once('ready', () => resolve(client))
        client.once('error', (err) => reject(err))

        client.connect(config)
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function testSshConnection(profileId: string): Promise<{
    success: boolean
    latency_ms?: number
    error?: string
}> {
    const start = Date.now()
    let client: SshClient | null = null
    try {
        const config = await buildConnectConfig(profileId)
        client = await createSshClient(config)
        const latency_ms = Date.now() - start
        return { success: true, latency_ms }
    } catch (err) {
        return { success: false, error: (err as Error).message }
    } finally {
        client?.end()
    }
}

export async function scpScript(opts: {
    profileId: string
    scriptId: string
    remotePath: string
    permissions?: string
}): Promise<{ success: boolean; remote_path: string; error?: string }> {
    const { profileId, scriptId, remotePath, permissions = '755' } = opts

    const script = await prisma.script.findUnique({ where: { id: scriptId } })
    if (!script) return { success: false, remote_path: '', error: 'Script not found' }

    const localPath = await getScriptResolvedFilePath(script)
    if (!fs.existsSync(localPath)) {
        return { success: false, remote_path: '', error: `Local script file not found: ${localPath}` }
    }

    const remoteFilePath = remotePath.endsWith('/')
        ? remotePath + script.filename
        : remotePath + '/' + script.filename

    let client: SshClient | null = null
    try {
        const config = await buildConnectConfig(profileId)
        client = await createSshClient(config)

        // SFTP transfer
        await new Promise<void>((resolve, reject) => {
            client!.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
                if (err) return reject(err)

                const readStream = fs.createReadStream(localPath)
                const writeStream = sftp.createWriteStream(remoteFilePath)

                writeStream.on('close', () => {
                    sftp.end()
                    resolve()
                })
                writeStream.on('error', (e: Error) => {
                    sftp.end()
                    reject(e)
                })
                readStream.pipe(writeStream)
            })
        })

        // Apply chmod
        await execCommand(client, `chmod ${permissions} "${remoteFilePath}"`)

        return { success: true, remote_path: remoteFilePath }
    } catch (err) {
        return { success: false, remote_path: remoteFilePath, error: (err as Error).message }
    } finally {
        client?.end()
    }
}

export async function execRemote(opts: {
    profileId: string
    command: string
    remoteExecId: string
}): Promise<void> {
    const { profileId, command, remoteExecId } = opts

    const emitter = new EventEmitter()
    remoteExecEmitters.set(remoteExecId, emitter)

    // Update DB record: running
    await prisma.remoteExecution.update({
        where: { id: remoteExecId },
        data: { status: 'running', startedAt: new Date() },
    }).catch(() => { /* record may not exist in stub mode */ })

    let client: SshClient | null = null
    const outputLines: string[] = []
    let exitCode = 1

    try {
        const config = await buildConnectConfig(profileId)
        client = await createSshClient(config)

        await new Promise<void>((resolve, reject) => {
            client!.exec(command, (err, stream) => {
                if (err) return reject(err)

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

                stream.on('error', (e: Error) => reject(e))
            })
        })

        const fullOutput = outputLines.join('')
        await prisma.remoteExecution.update({
            where: { id: remoteExecId },
            data: {
                status: exitCode === 0 ? 'success' : 'failure',
                exitCode,
                finishedAt: new Date(),
                logOutput: fullOutput.slice(0, 100000), // cap to 100KB
            },
        }).catch(() => { })
    } catch (err) {
        const errMsg = `\n[Error] ${(err as Error).message}\n`
        outputLines.push(errMsg)
        emitter.emit('line', errMsg)
        exitCode = 1
        emitter.emit('done', exitCode)

        await prisma.remoteExecution.update({
            where: { id: remoteExecId },
            data: {
                status: 'failure',
                exitCode,
                finishedAt: new Date(),
                logOutput: outputLines.join('').slice(0, 100000),
            },
        }).catch(() => { })
    } finally {
        client?.end()
        remoteExecEmitters.delete(remoteExecId)
    }
}

export function getRemoteExecEmitter(id: string): EventEmitter | undefined {
    return remoteExecEmitters.get(id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal utility: run a single command and collect output
// ─────────────────────────────────────────────────────────────────────────────

function execCommand(client: SshClient, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        client.exec(command, (err, stream) => {
            if (err) return reject(err)
            const chunks: Buffer[] = []
            stream.on('data', (d: Buffer) => chunks.push(d))
            stream.stderr.on('data', (d: Buffer) => chunks.push(d))
            stream.on('close', () => resolve(Buffer.concat(chunks).toString()))
            stream.on('error', reject)
        })
    })
}
