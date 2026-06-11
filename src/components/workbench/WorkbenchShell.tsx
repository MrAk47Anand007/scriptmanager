'use client'

import { useEffect, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from './CommandPalette'
import { Toaster } from '@/components/ui/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { toggleDock, setPaletteOpen } from '@/features/workbench/workbenchSlice'
import { selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { useRequestCloseTab } from './tabSync'

export function WorkbenchShell({ activityBar, sidePanel, dock, children }: {
  activityBar: ReactNode
  sidePanel: ReactNode | null
  dock: ReactNode | null
  children: ReactNode
}) {
  const dispatch = useAppDispatch()
  const { resolvedTheme } = useTheme()
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  const requestCloseTab = useRequestCloseTab()

  // Keep the native Windows window-control overlay in sync with the app theme
  useEffect(() => {
    if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
      void window.scriptManagerDesktop?.setTitleBarTheme?.(resolvedTheme)
    }
  }, [resolvedTheme])

  // Global workbench shortcuts (skip if something else already handled it):
  //   Ctrl+`        toggle bottom dock
  //   Ctrl+P/Ctrl+K open command palette
  //   Ctrl+W        close active editor tab (with dirty confirm)
  //   Ctrl+Enter    run active script / send active api request (via CustomEvent,
  //                 handled in ScriptsManager / ApiRequestEditor)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      const ctrl = e.ctrlKey || e.metaKey
      // Match e.code too so the shortcut works on keyboard layouts where
      // the backquote key produces a different character.
      if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault()
        dispatch(toggleDock())
      } else if (ctrl && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault()
        dispatch(setPaletteOpen(true))
      } else if (ctrl && e.key === 'w') {
        // preventDefault so the browser/Electron doesn't close the window
        e.preventDefault()
        const active = tabs.find((t) => t.id === activeTabId)
        if (active) requestCloseTab(active)
      } else if (ctrl && e.key === 'Enter') {
        const active = tabs.find((t) => t.id === activeTabId)
        if (!active) return
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(
          active.kind === 'script' ? 'scriptmanager:run-active-script' : 'scriptmanager:send-active-request'
        ))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dispatch, tabs, activeTabId, requestCloseTab])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <div className="w-12 shrink-0 border-r border-wb-border bg-wb-activitybar">{activityBar}</div>
        {sidePanel}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{children}</div>
          {dock}
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <Toaster />
    </div>
  )
}
