'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cron } from 'croner'
import { CalendarClock, Play, RefreshCw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  fetchScripts, runScript, saveSchedule, setActiveScript,
} from '@/features/scripts/scriptsSlice'
import { selectScriptItems } from '@/features/scripts/selectors'
import { setActiveActivity } from '@/features/workbench/workbenchSlice'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

/** Basic cron humanizer — covers common shapes, falls back to the raw expression. */
function humanizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, month, dow] = parts

  const everyN = (field: string) => {
    const m = field.match(/^\*\/(\d+)$/)
    return m ? Number.parseInt(m[1], 10) : null
  }
  const isNum = (field: string) => /^\d+$/.test(field)
  const pad = (n: string) => n.padStart(2, '0')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  if (dom === '*' && month === '*' && dow === '*') {
    const nMin = everyN(min)
    if (nMin && hour === '*') return nMin === 1 ? 'Every minute' : `Every ${nMin} minutes`
    if (min === '*' && hour === '*') return 'Every minute'
    const nHour = everyN(hour)
    if (isNum(min) && nHour) {
      return nHour === 1
        ? `Hourly at :${pad(min)}`
        : `Every ${nHour} hours at :${pad(min)}`
    }
    if (isNum(min) && hour === '*') return `Hourly at :${pad(min)}`
    if (isNum(min) && isNum(hour)) return `Daily at ${pad(hour)}:${pad(min)}`
  }
  if (dom === '*' && month === '*' && isNum(dow) && isNum(min) && isNum(hour)) {
    const day = dayNames[Number.parseInt(dow, 10) % 7]
    return `Every ${day} at ${pad(hour)}:${pad(min)}`
  }
  if (isNum(dom) && month === '*' && dow === '*' && isNum(min) && isNum(hour)) {
    return `Monthly on day ${dom} at ${pad(hour)}:${pad(min)}`
  }
  return expr
}

function getNextRun(expr: string): Date | null {
  try {
    const job = new Cron(expr, { paused: true })
    const next = job.nextRun()
    job.stop()
    return next
  } catch {
    return null
  }
}

function formatRelative(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'
  const totalMinutes = Math.round(diffMs / 60000)
  if (totalMinutes < 1) return 'in <1m'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

export function SchedulesView() {
  const dispatch = useAppDispatch()
  const scripts = useAppSelector(selectScriptItems)
  const [now, setNow] = useState(() => new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  // Keep relative "next run" labels fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const scheduled = useMemo(
    () => scripts
      .filter((s) => Boolean(s.schedule_cron))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [scripts]
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await dispatch(fetchScripts())
    } finally {
      setRefreshing(false)
      setNow(new Date())
    }
  }, [dispatch])

  const handleOpenScript = useCallback((scriptId: string) => {
    dispatch(setActiveActivity('scripts'))
    dispatch(setActiveScript(scriptId))
  }, [dispatch])

  const handleToggle = useCallback(async (scriptId: string, cron: string, enabled: boolean) => {
    setPendingToggleId(scriptId)
    try {
      await dispatch(saveSchedule({ scriptId, cron, enabled }))
    } finally {
      setPendingToggleId(null)
    }
  }, [dispatch])

  const handleRunNow = useCallback(async (scriptId: string) => {
    setRunningId(scriptId)
    try {
      await dispatch(runScript({ id: scriptId }))
    } finally {
      setRunningId(null)
    }
  }, [dispatch])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-wb-border px-4 py-3">
        <CalendarClock className="h-4 w-4 text-accent-brand" />
        <h1 className="text-[13px] font-semibold text-foreground">Schedules</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {scheduled.length}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {scheduled.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <CalendarClock className="h-8 w-8 opacity-40" />
            <p className="text-[13px]">No schedules yet — set a cron on any script.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs">Script</TableHead>
                <TableHead className="h-9 text-xs">Cron</TableHead>
                <TableHead className="h-9 text-xs">Next run</TableHead>
                <TableHead className="h-9 text-xs">Enabled</TableHead>
                <TableHead className="h-9 w-[110px] text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduled.map((script) => {
                const cron = script.schedule_cron as string
                const enabled = Boolean(script.schedule_enabled)
                const nextRun = enabled ? getNextRun(cron) : null
                const humanized = humanizeCron(cron)
                return (
                  <TableRow key={script.id}>
                    <TableCell className="py-2">
                      <button
                        type="button"
                        className="wb-transition text-[13px] text-foreground hover:text-accent-brand hover:underline"
                        onClick={() => handleOpenScript(script.id)}
                        title="Open script"
                      >
                        {script.name}
                      </button>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col gap-0.5">
                        <code className="font-logs text-xs text-foreground">{cron}</code>
                        {humanized !== cron && (
                          <span className="text-[11px] text-muted-foreground">{humanized}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      {nextRun ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-logs text-xs text-foreground">{formatRelative(nextRun, now)}</span>
                          <span className="font-logs text-[11px] text-muted-foreground">
                            {nextRun.toLocaleString()}
                          </span>
                        </div>
                      ) : (
                        <span className="font-logs text-xs text-muted-foreground">
                          {enabled ? 'invalid cron' : 'paused'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Switch
                        checked={enabled}
                        disabled={pendingToggleId === script.id}
                        onCheckedChange={(checked) => void handleToggle(script.id, cron, checked)}
                        aria-label={`Toggle schedule for ${script.name}`}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 px-2 text-[11px]"
                        disabled={runningId === script.id}
                        onClick={() => void handleRunNow(script.id)}
                      >
                        <Play className="h-3 w-3" />
                        {runningId === script.id ? 'Running…' : 'Run now'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
