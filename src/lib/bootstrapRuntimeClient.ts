export async function loadBootstrapRuntime(): Promise<{ scripts: unknown[]; collections: unknown[]; settings: Record<string, string> }> {
  if (window.scriptManagerDesktop?.runtime?.getBootstrapState) {
    return window.scriptManagerDesktop.runtime.getBootstrapState() as Promise<{
      scripts: unknown[]
      collections: unknown[]
      settings: Record<string, string>
    }>
  }

  const response = await fetch('/api/bootstrap')
  if (!response.ok) {
    throw new Error('bootstrap failed')
  }
  return response.json() as Promise<{ scripts: unknown[]; collections: unknown[]; settings: Record<string, string> }>
}
