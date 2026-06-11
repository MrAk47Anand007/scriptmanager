'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppSelector } from '@/store/hooks'
import { selectActiveActivity, selectSidePanelVisible } from '@/features/workbench/selectors'
import { ScriptsSidebar } from '@/components/ScriptsSidebar'
import { ApiSidebar } from '@/components/api/ApiSidebar'
import { cn } from '@/lib/utils'

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 280
const STORAGE_KEY = 'wb_sidepanel_width'

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (Number.isNaN(parsed)) return DEFAULT_WIDTH
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed))
}

/**
 * Shared workbench side panel hosting the activity-specific sidebars.
 *
 * Collapse strategy: width animates to 0 (130ms) instead of unmounting so the
 * sidebars keep their dialogs, listeners and QuickSwitcher alive. The inactive
 * sidebar is hidden with `hidden`; ApiSidebar lazy-mounts on first activation
 * of the api activity (mirroring page.tsx's mountedTabs pattern).
 */
export function SidePanel() {
  const activeActivity = useAppSelector(selectActiveActivity)
  const sidePanelVisible = useAppSelector(selectSidePanelVisible)

  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [apiMounted, setApiMounted] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  useEffect(() => {
    setWidth(readStoredWidth())
  }, [])

  useEffect(() => {
    if (activeActivity === 'api') setApiMounted(true)
  }, [activeActivity])

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = drag.startWidth + (event.clientX - drag.startX)
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)))
    }

    const handlePointerUp = () => {
      dragRef.current = null
      setIsDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        window.localStorage.setItem(STORAGE_KEY, String(widthRef.current))
      } catch {
        // localStorage unavailable — ignore
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startWidth: widthRef.current }
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    event.preventDefault()
  }, [])

  // Settings has no sidebar — the panel collapses to width 0 there too.
  const collapsed = !sidePanelVisible || activeActivity === 'settings'
  const scriptsActive = activeActivity === 'scripts' || activeActivity === 'ops'
  const apiActive = activeActivity === 'api'

  return (
    <div className="flex h-full shrink-0">
      <div
        className={cn(
          'h-full overflow-hidden bg-wb-sidepanel border-r border-wb-border',
          // Arbitrary-property syntax avoids the Tailwind `duration-[130ms]`
          // ambiguity warning while keeping the 130ms width collapse.
          !isDragging && '[transition:width_130ms_ease-out]'
        )}
        style={{ width: collapsed ? 0 : width }}
        aria-hidden={collapsed}
      >
        <div className="h-full" style={{ width }}>
          <div className={cn('h-full', !scriptsActive && 'hidden')}>
            <ScriptsSidebar />
          </div>
          {apiMounted && (
            <div className={cn('h-full', !apiActive && 'hidden')}>
              <ApiSidebar />
            </div>
          )}
        </div>
      </div>
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="wb-transition h-full w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent-brand/40 active:bg-accent-brand/60"
          onPointerDown={startDrag}
        />
      )}
    </div>
  )
}
