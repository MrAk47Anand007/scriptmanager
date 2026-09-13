import { invokeTauri } from '@/lib/tauriInvoke'

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
}

export type SftpEntryRuntime = {
  name: string
  isDir: boolean
  size?: number | null
  path?: string | null
}

export async function listSftpDirRuntime(payload: { profileId: string; path: string }): Promise<{ path: string; entries: SftpEntryRuntime[] }> {
  if (isTauri()) return invokeTauri('sftp_list_dir', { payload }) as Promise<{ path: string; entries: SftpEntryRuntime[] }>
  if (window.scriptManagerDesktop?.runtime?.sftpListDir) {
    return window.scriptManagerDesktop.runtime.sftpListDir(payload) as Promise<{ path: string; entries: SftpEntryRuntime[] }>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function readSftpTextRuntime(payload: { profileId: string; path: string }): Promise<{ path: string; content: string; binary?: boolean; truncated?: boolean; size?: number }> {
  if (isTauri()) return invokeTauri('sftp_read_text_file', { payload })
  if (window.scriptManagerDesktop?.runtime?.sftpReadText) {
    return window.scriptManagerDesktop.runtime.sftpReadText(payload)
  }
  throw new Error('Desktop runtime unavailable')
}

export async function writeSftpTextRuntime(payload: { profileId: string; path: string; content: string }): Promise<{ saved: boolean; path: string }> {
  if (isTauri()) return invokeTauri('sftp_write_text_file', { payload }) as Promise<{ saved: boolean; path: string }>
  if (window.scriptManagerDesktop?.runtime?.sftpWriteText) {
    return window.scriptManagerDesktop.runtime.sftpWriteText(payload) as Promise<{ saved: boolean; path: string }>
  }
  throw new Error('Desktop runtime unavailable')
}

export async function deleteSftpEntryRuntime(payload: { profileId: string; path: string }, isDir: boolean): Promise<{ deleted: boolean; path: string }> {
  if (isTauri()) return invokeTauri('sftp_delete_entry', { payload, isDir }) as Promise<{ deleted: boolean; path: string }>
  if (window.scriptManagerDesktop?.runtime?.sftpDelete) {
    return window.scriptManagerDesktop.runtime.sftpDelete({ ...payload, isDir }) as Promise<{ deleted: boolean; path: string }>
  }
  throw new Error('Desktop runtime unavailable')
}
