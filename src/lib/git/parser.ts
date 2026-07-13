import type { GitBranches, GitDiffFile, GitFileStatus, GitStatus } from './types'

function fileState(x: string, y: string): GitFileStatus['state'] {
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) return 'conflicted'
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'R' || y === 'R') return 'renamed'
  return 'modified'
}

export function parseStatus(output: string): GitStatus {
  const lines = output.replace(/\r/g, '').split('\n').filter(Boolean)
  const header = lines.shift()?.replace(/^##\s*/, '') ?? ''
  const branch = header.split(/[.\s]/)[0] || '(detached)'
  const upstream = header.includes('...') ? header.split('...')[1].split(' ')[0] : null
  const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? 0)
  const behind = Number(header.match(/behind (\d+)/)?.[1] ?? 0)
  const files = lines.map(line => {
    const index = line[0], workingTree = line[1]
    const rawPath = line.slice(3).trim()
    const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ')[1] : rawPath
    return { path: filePath, index, workingTree, state: fileState(index, workingTree) }
  })
  return { branch, upstream, ahead, behind, files, clean: files.length === 0 }
}

export function parseBranches(output: string): GitBranches {
  const local: string[] = [], remote: string[] = []
  let current: string | null = null
  for (const line of output.replace(/\r/g, '').split('\n').filter(Boolean)) {
    const active = line.startsWith('*')
    const name = line.replace(/^\*?\s+/, '').trim()
    if (name.startsWith('remotes/')) remote.push(name.slice(8)); else local.push(name)
    if (active) current = name
  }
  return { current, local, remote }
}

export function parseUnifiedDiff(output: string): GitDiffFile[] {
  return output.split(/^diff --git /m).slice(1).map(section => {
    const firstLine = section.split('\n')[0]
    const path = firstLine.match(/a\/(.+?) b\/(.+)$/)?.[2] ?? firstLine
    const patch = `diff --git ${section}`
    const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).length
    const deletions = patch.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---')).length
    return { path, additions, deletions, patch }
  })
}
