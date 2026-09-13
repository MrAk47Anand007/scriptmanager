/// Humanize a millisecond duration for run lists and metric cards:
/// 820 -> "820ms", 12400 -> "12.4s", 274000 -> "4m 34s", 5_400_000 -> "1h 30m".
export function formatDurationMs(ms?: number | null): string {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) {
    return totalSeconds < 10 ? `${totalSeconds.toFixed(1)}s` : `${Math.round(totalSeconds)}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
