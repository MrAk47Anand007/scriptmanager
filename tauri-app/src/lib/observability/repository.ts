import type { PrismaClient } from '@prisma/client'
import { redactExecutionValue } from '@/lib/execution/events'
import { normalizeStatus } from './filters'
import type { ExecutionDashboard, ExecutionFilters, ExecutionKind, ExecutionRunSummary } from './types'

const iso = (value: Date | null | undefined) => value?.toISOString()
const duration = (start?: Date | null, finish?: Date | null) => start && finish ? Math.max(0, finish.getTime() - start.getTime()) : undefined
const parseRedacted = (value: string | null | undefined) => {
  if (!value) return undefined
  try { return redactExecutionValue(JSON.parse(value)) } catch { return redactExecutionValue(value) }
}

export function createObservabilityRepository(database: PrismaClient) {
  async function listRuns(filters: ExecutionFilters): Promise<ExecutionRunSummary[]> {
    const createdAt = { gte: filters.from, lte: filters.to }
    const all: ExecutionRunSummary[] = []
    if (!filters.kind || filters.kind === 'workflow') {
      const rows = await database.workflowRun.findMany({
        where: { workflowId: filters.workflowId, triggerType: filters.trigger, actorId: filters.actorId, createdAt, workflow: filters.workspaceId ? { workspaceId: filters.workspaceId } : undefined },
        include: { workflow: true, nodeRuns: true }, orderBy: { createdAt: 'desc' }, take: filters.limit,
      })
      all.push(...rows.map(row => ({ id: row.id, kind: 'workflow' as const, name: row.workflow.name, status: normalizeStatus(row.status), trigger: row.triggerType, actorId: row.actorId, correlationId: row.correlationId, startedAt: iso(row.startedAt ?? row.createdAt), finishedAt: iso(row.finishedAt), durationMs: duration(row.startedAt ?? row.createdAt, row.finishedAt), retryCount: row.nodeRuns.reduce((sum, node) => sum + Math.max(0, node.attempt - 1), 0) })))
    }
    if (!filters.kind || filters.kind === 'script') {
      const rows = await database.build.findMany({ where: { scriptId: filters.scriptId, triggeredBy: filters.trigger, createdAt, script: filters.workspaceId ? { workspaceId: filters.workspaceId } : undefined }, include: { script: true }, orderBy: { createdAt: 'desc' }, take: filters.limit })
      all.push(...rows.map(row => ({ id: row.id, kind: 'script' as const, name: row.script.name, status: normalizeStatus(row.status), trigger: row.triggeredBy, startedAt: iso(row.startedAt ?? row.createdAt), finishedAt: iso(row.finishedAt), durationMs: duration(row.startedAt ?? row.createdAt, row.finishedAt), retryCount: 0 })))
    }
    if (!filters.kind || filters.kind === 'api') {
      const rows = await database.apiCollectionRun.findMany({ where: { collectionId: filters.workflowId, startedAt: createdAt, collection: filters.workspaceId ? { workspaceId: filters.workspaceId } : undefined }, orderBy: { startedAt: 'desc' }, take: filters.limit })
      all.push(...rows.map(row => ({ id: row.id, kind: 'api' as const, name: row.collectionName, status: normalizeStatus(row.status), trigger: 'manual', startedAt: iso(row.startedAt), finishedAt: iso(row.finishedAt), durationMs: row.durationMs ?? duration(row.startedAt, row.finishedAt), retryCount: 0 })))
    }
    if (!filters.kind || filters.kind === 'remote') {
      const rows = await database.remoteExecution.findMany({ where: { triggeredBy: filters.trigger, requestedAt: createdAt, profile: (filters.projectId || filters.workspaceId) ? { ...(filters.projectId ? { projectId: filters.projectId } : {}), ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}) } : undefined }, orderBy: { requestedAt: 'desc' }, take: filters.limit })
      all.push(...rows.map(row => ({ id: row.id, kind: 'remote' as const, name: `${row.scriptName} · ${row.profileName}`, status: normalizeStatus(row.status), trigger: row.triggeredBy, actorId: row.approvedBy ?? undefined, startedAt: iso(row.startedAt ?? row.requestedAt), finishedAt: iso(row.finishedAt), durationMs: duration(row.startedAt ?? row.requestedAt, row.finishedAt), retryCount: 0 })))
    }
    return all.filter(run => !filters.status || run.status === filters.status).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')).slice(0, filters.limit)
  }

  async function getDashboard(filters: ExecutionFilters): Promise<ExecutionDashboard> {
    const runs = await listRuns({ ...filters, limit: Math.max(filters.limit, 200) })
    const terminal = runs.filter(run => run.durationMs !== undefined)
    const failures = runs.filter(run => ['failed', 'timed_out', 'interrupted'].includes(run.status))
    const trend = new Map<string, number>()
    failures.forEach(run => { const day = (run.finishedAt ?? run.startedAt ?? '').slice(0, 10); if (day) trend.set(day, (trend.get(day) ?? 0) + 1) })
    const [enabledSchedules, disabledSchedules] = await Promise.all([
      database.workflowTrigger.count({ where: { type: 'cron', enabled: true, workflow: filters.workspaceId ? { workspaceId: filters.workspaceId } : undefined } }),
      database.workflowTrigger.count({ where: { type: 'cron', enabled: false, workflow: filters.workspaceId ? { workspaceId: filters.workspaceId } : undefined } }),
    ])
    return {
      metrics: { active: runs.filter(run => ['queued', 'running', 'waiting'].includes(run.status)).length, succeeded: runs.filter(run => run.status === 'succeeded').length, failed: failures.length, timedOut: runs.filter(run => run.status === 'timed_out').length, retried: runs.reduce((sum, run) => sum + run.retryCount, 0), averageDurationMs: terminal.length ? Math.round(terminal.reduce((sum, run) => sum + (run.durationMs ?? 0), 0) / terminal.length) : 0 },
      activeRuns: runs.filter(run => ['queued', 'running', 'waiting'].includes(run.status)), recentRuns: runs.slice(0, 50),
      failureTrend: [...trend.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      scheduleHealth: { healthy: enabledSchedules, disabled: disabledSchedules, failing: failures.filter(run => run.trigger === 'cron').length },
    }
  }

  async function getRunDetail(kind: ExecutionKind, id: string, workspaceId?: string) {
    if (kind === 'workflow') {
      const run = await database.workflowRun.findFirst({ where: { id, workflow: workspaceId ? { workspaceId } : undefined }, include: { workflow: true, nodeRuns: true } })
      if (!run) return null
      const events = await database.executionEvent.findMany({ where: { correlationId: run.correlationId }, orderBy: { occurredAt: 'asc' } })
      return { ...run, input: parseRedacted(run.inputJson), output: parseRedacted(run.outputJson), error: parseRedacted(run.errorJson), inputJson: undefined, outputJson: undefined, errorJson: undefined, nodeRuns: run.nodeRuns.map(node => ({ ...node, input: parseRedacted(node.inputJson), output: parseRedacted(node.outputJson), error: parseRedacted(node.errorJson), inputJson: undefined, outputJson: undefined, errorJson: undefined })), events: events.map(event => ({ ...event, data: parseRedacted(event.dataJson), dataJson: undefined })) }
    }
    if (kind === 'script') {
      const build = await database.build.findFirst({ where: { id, script: workspaceId ? { workspaceId } : undefined }, include: { script: { select: { id: true, name: true } } } })
      return build ? { ...build, webhookPayload: parseRedacted(build.webhookPayload) } : null
    }
    if (kind === 'api') {
      const apiRun = await database.apiCollectionRun.findFirst({ where: { id, collection: workspaceId ? { workspaceId } : undefined } })
      return apiRun ? { ...apiRun, results: parseRedacted(apiRun.results) } : null
    }
    const remote = await database.remoteExecution.findFirst({ where: { id, profile: workspaceId ? { workspaceId } : undefined } })
    return remote ? { ...remote, logOutput: redactExecutionValue(remote.logOutput), paramValues: parseRedacted(remote.paramValues) } : null
  }

  return { listRuns, getDashboard, getRunDetail }
}
