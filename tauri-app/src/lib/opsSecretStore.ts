import { execFile } from 'child_process'
import { promisify } from 'util'
import { decryptSecret, encryptSecret, getEncryptionKey, type EncryptedPayload } from './crypto'

const execFileAsync = promisify(execFile)
const DPAPI_PREFIX = 'dpapi:'
const LEGACY_PREFIX = 'legacy:'

function isDpapiSecret(value: string) {
    return value.startsWith(DPAPI_PREFIX)
}

function isLegacyWrappedSecret(value: string) {
    return value.startsWith(LEGACY_PREFIX)
}

async function runPowerShell(script: string) {
    const command = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
    const { stdout } = await execFileAsync(
        command,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
            windowsHide: true,
            maxBuffer: 1024 * 1024,
        }
    )
    return stdout.trim()
}

async function protectWithDpapi(plaintext: string) {
    const input = Buffer.from(plaintext, 'utf8').toString('base64')
    const output = await runPowerShell(`
$bytes = [Convert]::FromBase64String('${input}')
$protected = [System.Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Convert]::ToBase64String($protected)
    `)
    return `${DPAPI_PREFIX}${output}`
}

async function unprotectWithDpapi(payload: string) {
    const encoded = payload.slice(DPAPI_PREFIX.length)
    const output = await runPowerShell(`
$bytes = [Convert]::FromBase64String('${encoded}')
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $bytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Text.Encoding]::UTF8.GetString($plain)
    `)
    return output
}

async function protectWithLegacyCrypto(plaintext: string) {
    const key = await getEncryptionKey()
    return `${LEGACY_PREFIX}${JSON.stringify(encryptSecret(plaintext, key))}`
}

async function revealLegacySecret(storedSecret: string) {
    const rawPayload = isLegacyWrappedSecret(storedSecret)
        ? storedSecret.slice(LEGACY_PREFIX.length)
        : storedSecret
    const key = await getEncryptionKey()
    return decryptSecret(JSON.parse(rawPayload) as EncryptedPayload, key)
}

export async function sealOpsSecret(plaintext: string) {
    if (!plaintext) {
        throw new Error('Secret cannot be empty')
    }
    if (process.platform === 'win32') {
        try {
            return await protectWithDpapi(plaintext)
        } catch {
            return protectWithLegacyCrypto(plaintext)
        }
    }
    return protectWithLegacyCrypto(plaintext)
}

export async function revealOpsSecret(storedSecret: string | null | undefined) {
    if (!storedSecret) return null
    if (isDpapiSecret(storedSecret)) {
        return unprotectWithDpapi(storedSecret)
    }
    return revealLegacySecret(storedSecret)
}

export function hasStoredOpsSecret(storedSecret: string | null | undefined) {
    return !!storedSecret
}
