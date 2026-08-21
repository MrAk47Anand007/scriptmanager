import { prisma } from '@/lib/db'
import { createWorkflowRepository, type WorkflowRepository } from './repository'
import { productionWorkflowAdapters } from './runtimeAdapters'
import { runClaimedWorkflow } from './worker'

const DEFAULT_POLL_INTERVAL_MS = 1_500

export type WorkflowWorkerLoopOptions = {
  repository?: WorkflowRepository
  pollIntervalMs?: number
  workerId?: string
  logger?: Pick<Console, 'log' | 'error'>
}

export type WorkflowWorkerLoop = {
  reconcile: () => Promise<number>
  drain: () => Promise<number>
  start: () => void
  stop: () => void
  notify: () => void
  isRunning: () => boolean
}

export function createWorkflowWorkerLoop(options: WorkflowWorkerLoopOptions = {}): WorkflowWorkerLoop {
  const repository = options.repository ?? createWorkflowRepository(prisma)
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const workerId = options.workerId ?? `server-${process.pid}`
  const logger = options.logger ?? console
  let timer: ReturnType<typeof setInterval> | null = null
  let draining = false

  const reconcile = async (): Promise<number> => {
    const result = await repository.reconcileInterruptedRuns()
    if (result.count > 0) logger.log(`[WorkflowWorker] Reconciled ${result.count} interrupted workflow run(s)`)
    return result.count
  }

  const claimOnce = async (): Promise<string | null> => {
    let claimed: Awaited<ReturnType<WorkflowRepository['claimNextRun']>>
    try {
      claimed = await repository.claimNextRun(workerId)
    } catch (error) {
      logger.error('[WorkflowWorker] Claim failed:', error)
      return null
    }
    if (!claimed) return null
    try {
      await runClaimedWorkflow(claimed, repository, productionWorkflowAdapters)
    } catch (error) {
      logger.error(`[WorkflowWorker] Run ${claimed.id} crashed:`, error)
      try { await repository.setRunStatus(claimed.id, 'failed', undefined, { message: error instanceof Error ? error.message : String(error) }) } catch {}
    }
    return claimed.id
  }

  const drain = async (): Promise<number> => {
    if (draining) return 0
    draining = true
    let processed = 0
    try {
      while (await claimOnce()) processed++
    } finally {
      draining = false
    }
    return processed
  }

  const notify = (): void => {
    void drain()
  }

  return {
    reconcile,
    drain,
    start() {
      if (timer) return
      void reconcile().catch((error) => logger.error('[WorkflowWorker] Reconciliation failed:', error))
      timer = setInterval(() => void drain(), pollIntervalMs)
      timer.unref?.()
      logger.log(`[WorkflowWorker] Started (poll every ${pollIntervalMs}ms)`)
    },
    stop() {
      if (!timer) return
      clearInterval(timer)
      timer = null
    },
    notify,
    isRunning: () => timer !== null,
  }
}

let singleton: WorkflowWorkerLoop | null = null

export function getWorkflowWorkerLoop(): WorkflowWorkerLoop {
  singleton ??= createWorkflowWorkerLoop()
  return singleton
}

export function startWorkflowWorker(): void {
  getWorkflowWorkerLoop().start()
}

export function stopWorkflowWorker(): void {
  singleton?.stop()
}

export function notifyWorkflowWorker(): void {
  getWorkflowWorkerLoop().notify()
}
