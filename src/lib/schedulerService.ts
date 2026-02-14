import { Cron } from 'croner'
import { prisma } from '@/lib/db'
import { executeScriptAsync } from '@/lib/scriptRunner'
import type { ScriptParameter } from '@/lib/types'

// Module-level map: scriptId -> Cron instance
const scheduledJobs = new Map<string, Cron>()

interface ScriptScheduleInfo {
  id: string
  filename: string
  language: string
  interpreter?: string | null
  scheduleCron: string | null
  scheduleEnabled: boolean
}

export async function initScheduler(): Promise<void> {
  const scripts = await prisma.script.findMany({
    where: { scheduleEnabled: true, scheduleCron: { not: null } }
  })

  let registered = 0
  for (const script of scripts) {
    if (script.scheduleCron) {
      try {
        registerSchedule(script)
        registered++
      } catch (err) {
        console.error(`[Scheduler] Failed to register job for script ${script.name}:`, err)
      }
    }
  }

  console.log(`[Scheduler] Initialized with ${registered} active job(s)`)
}

export function registerSchedule(script: ScriptScheduleInfo): void {
  removeSchedule(script.id)

  if (!script.scheduleEnabled || !script.scheduleCron) return

  try {
    const job = new Cron(script.scheduleCron, async () => {
      try {
        const freshScript = await prisma.script.findUnique({ where: { id: script.id } })
        if (!freshScript || !freshScript.scheduleEnabled) return

        const build = await prisma.build.create({
          data: {
            scriptId: freshScript.id,
            status: 'pending',
            triggeredBy: 'scheduler'
          }
        })

        // Build param values from defaults for scheduled runs (no interactive user)
        let paramValues: Record<string, string> | undefined
        if (freshScript.parameters && freshScript.parameters !== '[]') {
          try {
            const scriptParams: ScriptParameter[] = JSON.parse(freshScript.parameters)
            if (scriptParams.length > 0) {
              paramValues = {}
              for (const param of scriptParams) {
                if (param.defaultValue !== undefined) {
                  paramValues[param.name] = param.defaultValue
                }
              }
            }
          } catch {
            // Malformed JSON — run without params
          }
        }

        await executeScriptAsync(build.id, freshScript, paramValues)
      } catch (err) {
        console.error(`[Scheduler] Error running scheduled script ${script.id}:`, err)
      }
    })

    scheduledJobs.set(script.id, job)
    console.log(`[Scheduler] Registered job for script ${script.id} with cron: ${script.scheduleCron}`)
  } catch (err) {
    console.error(`[Scheduler] Invalid cron expression '${script.scheduleCron}' for script ${script.id}:`, err)
    throw err
  }
}

export function removeSchedule(scriptId: string): void {
  const existing = scheduledJobs.get(scriptId)
  if (existing) {
    existing.stop()
    scheduledJobs.delete(scriptId)
    console.log(`[Scheduler] Removed job for script ${scriptId}`)
  }
}

export function getNextRunTime(cronExpression: string): string | null {
  try {
    const job = new Cron(cronExpression, { paused: true })
    const next = job.nextRun()
    job.stop()
    return next ? next.toISOString() : null
  } catch {
    return null
  }
}

export function isSchedulerRunning(scriptId: string): boolean {
  return scheduledJobs.has(scriptId)
}
