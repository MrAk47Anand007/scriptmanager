export const desktopCapabilities = {
  startup: true,
  scripts: true,
  collections: true,
  terminal: true,
  apiClient: true,
  workflows: true,
  observability: true,
  approvals: true,
  secrets: true,
  notifications: false,
  git: true,
  ops: true,
  storage: false,
  agents: false,
  plugins: false,
  workspaceAccess: false,
} as const

export type DesktopCapability = keyof typeof desktopCapabilities

export function isDesktopCapabilityEnabled(feature: DesktopCapability): boolean {
  return desktopCapabilities[feature]
}
