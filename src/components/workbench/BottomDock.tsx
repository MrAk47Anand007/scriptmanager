'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectDockVisible, selectActiveDockTab } from '@/features/workbench/selectors'
import { setDockVisible, setActiveDockTab, type DockTabId } from '@/features/workbench/workbenchSlice'
import { selectIsModeActive } from '@/features/ops/selectors'
import { cn } from '@/lib/utils'

const AuditTrailPanel = dynamic(() => import('../AuditTrailPanel').then((mod) => mod.AuditTrailPanel), {
  ssr: false,
  loading: () => <div className="p-3 text-[10px] text-muted-foreground">Loading audit trail...</div>,
})

const DOCK_HEIGHT_KEY = 'wb_dock_height'
const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 120

/** Pane container ids — ScriptsManager portals its terminal/output/builds content into these. */
export const DOCK_PANE_IDS: Record<Exclude<DockTabId, 'audit'>, string> = {
  terminal: 'wb-dock-pane-terminal',
  output: 'wb-dock-pane-output',
  builds: 'wb-dock-pane-builds',
}

const BASE_TABS: { id: DockTabId; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'output', label: 'Output' },
  { id: 'builds', label: 'Builds' },
]

function clampHeight(value: number) {
  const max = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.6) : 600
  return Math.max(MIN_HEIGHT, Math.min(max, value))
}

export function BottomDock() {
  const dispatch = useAppDispatch()
  const visible = useAppSelector(selectDockVisible)
  const activeTab = useAppSelector(selectActiveDockTab)
  const isModeActive = useAppSelector(selectIsModeActive)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [auditMounted, setAuditMounted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(DOCK_HEIGHT_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!Number.isNaN(parsed)) setHeight(clampHeight(parsed))
    }
  }, [])

  // Lazy-mount audit pane on first activation, then keep mounted.
  useEffect(() => {
    if (visible && activeTab === 'audit') setAuditMounted(true)
  }, [activeTab, visible])

  // Window listeners only attached while a drag is in progress (mirrors SidePanel)
  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      setHeight(clampHeight(drag.startHeight + (drag.startY - event.clientY)))
    }
    const handlePointerUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      setIsDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setHeight((current) => {
        localStorage.setItem(DOCK_HEIGHT_KEY, String(current))
        return current
      })
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: event.clientY, startHeight: height }
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
    event.preventDefault()
  }, [height])

  const tabs = isModeActive ? [...BASE_TABS, { id: 'audit' as DockTabId, label: 'Audit' }] : BASE_TABS

  return (
    // Keep children mounted when hidden (height 0) so the terminal pty/xterm buffer survives.
    <div
      className={cn('flex flex-col overflow-hidden bg-background', visible && 'border-t border-wb-border')}
      style={{ height: visible ? height : 0 }}
    >
      <div
        className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center"
        onPointerDown={startResize}
        title="Resize panel"
      >
        <div className="wb-transition h-0.5 w-12 rounded-full bg-transparent group-hover:bg-accent-brand" />
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-wb-border px-2 text-xs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => dispatch(setActiveDockTab(tab.id))}
            className={cn(
              'wb-transition rounded px-2 py-1 uppercase tracking-wide text-[10px]',
              activeTab === tab.id
                ? 'text-foreground border-b-2 border-accent-brand rounded-b-none'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          className="wb-transition rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => dispatch(setDockVisible(false))}
          title="Close panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div id={DOCK_PANE_IDS.terminal} className={cn('absolute inset-0', activeTab !== 'terminal' && 'hidden')} />
        <div id={DOCK_PANE_IDS.output} className={cn('absolute inset-0 overflow-hidden', activeTab !== 'output' && 'hidden')} />
        <div id={DOCK_PANE_IDS.builds} className={cn('absolute inset-0 overflow-hidden', activeTab !== 'builds' && 'hidden')} />
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab !== 'audit' && 'hidden')}>
          {auditMounted && <AuditTrailPanel />}
        </div>
      </div>
    </div>
  )
}
