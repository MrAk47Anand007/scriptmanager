'use client'

import { useEffect, useState } from 'react'
import { Activity, Bot, CalendarClock, CheckCheck, Code2, GitBranch, Globe, Server, Settings, SquareTerminal, type LucideIcon } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveActivity, type ActivityId } from '@/features/workbench/workbenchSlice'
import { selectActiveActivity } from '@/features/workbench/selectors'
import { selectIsModeActive, selectRequiresApproval } from '@/features/ops/selectors'
import { selectRunStatus } from '@/features/scripts/selectors'
import { isDesktop } from '@/lib/runtime'

function ActivityButton({
  icon: Icon,
  title,
  active,
  onClick,
  badgeClassName,
}: {
  icon: LucideIcon
  title: string
  active?: boolean
  onClick: () => void
  badgeClassName?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`wb-transition relative flex h-12 w-12 items-center justify-center ${
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-accent-brand" />
      )}
      <span className="relative">
        <Icon className="h-5 w-5" />
        {badgeClassName && (
          <span className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ${badgeClassName}`} />
        )}
      </span>
    </button>
  )
}

export function ActivityBar() {
  const dispatch = useAppDispatch()
  const activeActivity = useAppSelector(selectActiveActivity)
  const isOpsModeActive = useAppSelector(selectIsModeActive)
  const runStatus = useAppSelector(selectRunStatus)
  const requiresApproval = useAppSelector(selectRequiresApproval)
  const [desktop, setDesktop] = useState(false)

  useEffect(() => {
    setDesktop(isDesktop())
  }, [])

  const select = (id: ActivityId) => dispatch(setActiveActivity(id))

  return (
    <div className="flex h-full flex-col items-stretch">
      <ActivityButton
        icon={Code2}
        title="Scripts"
        active={activeActivity === 'scripts'}
        onClick={() => select('scripts')}
        badgeClassName={runStatus === 'running' ? 'bg-running animate-pulse' : undefined}
      />
      <ActivityButton
        icon={Globe}
        title="API"
        active={activeActivity === 'api'}
        onClick={() => select('api')}
      />
      <ActivityButton icon={GitBranch} title="Workflows" active={activeActivity === 'workflows'} onClick={() => select('workflows')} />
      <ActivityButton icon={Bot} title="Agents" active={activeActivity === 'agents'} onClick={() => select('agents')} />
      <ActivityButton icon={Activity} title="Executions" active={activeActivity === 'executions'} onClick={() => select('executions')} />
      <ActivityButton icon={CheckCheck} title="Approvals" active={activeActivity === 'approvals'} onClick={() => select('approvals')} />
      {isOpsModeActive && (
        <ActivityButton
          icon={Server}
          title="Ops"
          active={activeActivity === 'ops'}
          onClick={() => select('ops')}
          badgeClassName={requiresApproval ? 'bg-warning' : undefined}
        />
      )}
      {desktop && (
        <ActivityButton
          icon={SquareTerminal}
          title="Terminal"
          onClick={() => {
            // Guard: setActiveActivity toggles sidePanelVisible when already on scripts.
            if (activeActivity !== 'scripts') {
              select('scripts')
            }
            window.dispatchEvent(new CustomEvent('scriptmanager:open-terminal'))
          }}
        />
      )}
      <ActivityButton
        icon={CalendarClock}
        title="Schedules"
        active={activeActivity === 'schedules'}
        onClick={() => select('schedules')}
      />
      <div className="flex-1" />
      <ActivityButton
        icon={Settings}
        title="Settings"
        active={activeActivity === 'settings'}
        onClick={() => select('settings')}
      />
    </div>
  )
}
