import { describe, expect, it, vi } from 'vitest'
import { extractRepoName, injectGitAuth, sanitizeGitUrl } from '@/lib/git/remote'

describe('git remote helper utilities', () => {
  it('injects tokens correctly based on host platform', () => {
    // GitHub
    expect(injectGitAuth('https://github.com/org/repo.git', 'ghp_secret123')).toBe(
      'https://x-access-token:ghp_secret123@github.com/org/repo.git'
    )
    // GitLab
    expect(injectGitAuth('https://gitlab.com/org/repo.git', 'glpat-token456')).toBe(
      'https://oauth2:glpat-token456@gitlab.com/org/repo.git'
    )
    // Generic / other host
    expect(injectGitAuth('https://custom-git.example.com/repo.git', 'mytoken')).toBe(
      'https://mytoken@custom-git.example.com/repo.git'
    )
    // No token
    expect(injectGitAuth('https://github.com/org/repo.git')).toBe('https://github.com/org/repo.git')
  })

  it('sanitizes git URLs removing all credentials', () => {
    expect(sanitizeGitUrl('https://x-access-token:ghp_secret123@github.com/org/repo.git')).toBe(
      'https://github.com/org/repo.git'
    )
    expect(sanitizeGitUrl('https://oauth2:secret@gitlab.com/org/repo.git')).toBe(
      'https://gitlab.com/org/repo.git'
    )
  })

  it('extracts default project names from git URLs', () => {
    expect(extractRepoName('https://github.com/facebook/react.git')).toBe('react')
    expect(extractRepoName('https://github.com/n8n-io/n8n/')).toBe('n8n')
    expect(extractRepoName('https://gitlab.com/group/subgroup/core-engine.git')).toBe('core-engine')
  })
})
