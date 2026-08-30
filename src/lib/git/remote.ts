import path from 'node:path'
import fs from 'node:fs/promises'
import { runGit } from './process'
import { extractRepoName, injectGitAuth, sanitizeGitUrl } from './urlUtils'

export { extractRepoName, injectGitAuth, sanitizeGitUrl }

export type ProbeResult =
  | { isPrivate: false; status: 'ready'; defaultBranch?: string; message?: string }
  | { isPrivate: true; status: 'auth_required'; message: string }
  | { isPrivate: true; status: 'auth_failed'; message: string }
  | { isPrivate: false; status: 'error'; message: string }

/**
 * Probes a remote Git repository to determine if it is public, requires auth, or has invalid credentials.
 */
export async function probeGitRemote(url: string, token?: string): Promise<ProbeResult> {
  const targetUrl = injectGitAuth(url, token)
  const cwd = process.cwd()

  try {
    const result = await runGit(cwd, ['ls-remote', '--heads', targetUrl])

    if (result.exitCode === 0) {
      const branches = result.stdout
        .split('\n')
        .map((line) => line.split('refs/heads/')[1])
        .filter(Boolean)

      const defaultBranch = branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0] || 'main'
      return { isPrivate: false, status: 'ready', defaultBranch }
    }

    const stderr = result.stderr.toLowerCase()
    const isAuthFailure =
      stderr.includes('could not read username') ||
      stderr.includes('authentication failed') ||
      stderr.includes('not found') ||
      stderr.includes('repository not found') ||
      stderr.includes('401') ||
      stderr.includes('403') ||
      stderr.includes('permission denied') ||
      stderr.includes('access denied')

    if (isAuthFailure) {
      if (!token?.trim()) {
        return {
          isPrivate: true,
          status: 'auth_required',
          message: 'This repository is private or requires a Personal Access Token (PAT).',
        }
      }
      return {
        isPrivate: true,
        status: 'auth_failed',
        message: 'Authentication failed. Please verify your Personal Access Token has read access.',
      }
    }

    return {
      isPrivate: false,
      status: 'error',
      message: result.stderr.trim() || 'Could not connect to the remote repository.',
    }
  } catch (error) {
    return {
      isPrivate: false,
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to probe repository.',
    }
  }
}

/**
 * Clones a remote repository into a target path.
 */
export async function cloneGitRemote({
  url,
  targetPath,
  token,
  branch,
}: {
  url: string
  targetPath: string
  token?: string
  branch?: string
}): Promise<{ targetPath: string; defaultBranch: string }> {
  const targetUrl = injectGitAuth(url, token)
  const resolvedPath = path.resolve(targetPath)

  // Ensure parent directory exists
  const parentDir = path.dirname(resolvedPath)
  await fs.mkdir(parentDir, { recursive: true })

  // Check if destination directory already exists and is non-empty
  try {
    const existing = await fs.readdir(resolvedPath)
    if (existing.length > 0) {
      throw new Error(`Destination directory "${resolvedPath}" already exists and is not empty.`)
    }
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e
  }

  const args = ['clone', ...(branch ? ['-b', branch] : []), targetUrl, resolvedPath]
  const result = await runGit(parentDir, args)

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toLowerCase()
    if (
      stderr.includes('could not read username') ||
      stderr.includes('authentication failed') ||
      stderr.includes('401') ||
      stderr.includes('403')
    ) {
      throw new Error('Authentication failed while cloning. Please check your Access Token.')
    }
    throw new Error(result.stderr.trim() || 'Git clone failed.')
  }

  // Detect cloned repository's current branch
  let defaultBranch = 'main'
  try {
    const branchRes = await runGit(resolvedPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branchRes.exitCode === 0 && branchRes.stdout.trim()) {
      defaultBranch = branchRes.stdout.trim()
    }
  } catch {
    // fallback to main
  }

  return { targetPath: resolvedPath, defaultBranch }
}
