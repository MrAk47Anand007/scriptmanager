export type WorkflowAdapters = {
  runScript(config: Record<string, unknown>, input: unknown, signal?: AbortSignal): Promise<unknown>
  runApiRequest(config: Record<string, unknown>, input: unknown, signal?: AbortSignal): Promise<unknown>
  runRemoteCommand(config: Record<string, unknown>, input: unknown, signal?: AbortSignal): Promise<unknown>
  sendNotification(config: Record<string, unknown>, input: unknown, signal?: AbortSignal): Promise<unknown>
}
