import { spawn } from 'node:child_process'

export interface GitProcessResult { stdout: string; stderr: string; exitCode: number }
export type GitProcessRunner = (cwd: string, args: string[]) => Promise<GitProcessResult>

export const runGit: GitProcessRunner = (cwd, args) => new Promise((resolve, reject) => {
  const child = spawn('git', args, { cwd, shell: false, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  let stdout = '', stderr = ''
  const limit = 5 * 1024 * 1024
  child.stdout.on('data', chunk => { if (stdout.length < limit) stdout += String(chunk) })
  child.stderr.on('data', chunk => { if (stderr.length < limit) stderr += String(chunk) })
  child.on('error', reject)
  child.on('close', exitCode => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }))
})
