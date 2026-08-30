/**
 * Browser-safe and client-safe Git URL utilities.
 * Does NOT import Node.js builtins (fs, child_process, path).
 */

/**
 * Injects access token into a Git HTTPS URL.
 * Handles github.com, gitlab.com, bitbucket.org, and generic HTTPS git servers.
 */
export function injectGitAuth(rawUrl: string, token?: string): string {
  const trimmed = rawUrl.trim()
  if (!token?.trim()) return trimmed

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return trimmed
    }
    const cleanToken = token.trim()
    if (parsed.hostname.includes('gitlab.com')) {
      parsed.username = 'oauth2'
      parsed.password = cleanToken
    } else if (parsed.hostname.includes('github.com')) {
      parsed.username = 'x-access-token'
      parsed.password = cleanToken
    } else {
      parsed.username = cleanToken
      parsed.password = ''
    }
    return parsed.toString()
  } catch {
    return trimmed
  }
}

/**
 * Removes any credentials (username/password/tokens) from a Git URL.
 */
export function sanitizeGitUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim())
    parsed.username = ''
    parsed.password = ''
    return parsed.toString()
  } catch {
    return rawUrl.trim()
  }
}

/**
 * Extracts a suggested project name from a Git repository URL.
 * e.g. https://github.com/facebook/react.git -> react
 */
export function extractRepoName(rawUrl: string): string {
  try {
    const clean = sanitizeGitUrl(rawUrl).replace(/\/+$/, '')
    const lastSegment = clean.split('/').pop() || 'repo'
    return lastSegment.replace(/\.git$/i, '') || 'project'
  } catch {
    return 'project'
  }
}
