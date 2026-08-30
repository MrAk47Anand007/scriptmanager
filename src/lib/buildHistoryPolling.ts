export const DESKTOP_BUILD_HISTORY_POLL_INTERVAL_MS = 5_000

export function shouldPollDesktopBuildHistory(desktopRuntime: boolean, scriptId: string | null | undefined): scriptId is string {
  return desktopRuntime && typeof scriptId === 'string' && scriptId.length > 0
}
