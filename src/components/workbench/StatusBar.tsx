'use client'

import { useEffect, useState } from 'react'
import { useAppSelector } from '@/store/hooks'
import { selectRunStatus, selectSaveStatus } from '@/features/scripts/selectors'
import { isDesktop } from '@/lib/runtime'

const SAVE_LABELS: Record<string, { label: string; className: string }> = {
  idle: { label: '', className: '' },
  saving: { label: 'Saving…', className: 'text-running' },
  saved: { label: 'Saved', className: 'text-success' },
  failed: { label: 'Save failed', className: 'text-destructive' },
}

export function StatusBar() {
  const runStatus = useAppSelector(selectRunStatus)
  const saveStatus = useAppSelector(selectSaveStatus)
  const [isDesktopShell, setIsDesktopShell] = useState(false)

  useEffect(() => {
    setIsDesktopShell(isDesktop())
  }, [])

  const save = SAVE_LABELS[saveStatus] ?? SAVE_LABELS.idle

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-wb-border bg-wb-statusbar px-3 text-[11px] text-muted-foreground">
      <span className="rounded-sm bg-background/40 px-1.5 py-px font-medium">
        {isDesktopShell ? 'Desktop' : 'Web'}
      </span>
      <div className="ml-auto flex items-center gap-3">
        {save.label && <span className={save.className}>{save.label}</span>}
        <span className={runStatus === 'running' ? 'text-running' : 'text-muted-foreground'}>
          {runStatus === 'running' ? 'Running…' : 'Ready'}
        </span>
      </div>
    </footer>
  )
}
