export type LocalBuildStatus = 'success' | 'failure' | 'timeout' | 'cancelled'

export function resolveLocalBuildStatus(exitCode: number, timedOut: boolean, cancelled: boolean): LocalBuildStatus {
  if (timedOut) return 'timeout'
  if (cancelled) return 'cancelled'
  return exitCode === 0 ? 'success' : 'failure'
}
