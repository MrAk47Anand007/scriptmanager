'use client'

import { type ReactNode } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'

export function WorkbenchShell({ activityBar, sidePanel, dock, children }: {
  activityBar: ReactNode
  sidePanel: ReactNode | null
  dock: ReactNode | null
  children: ReactNode
}) {
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
    </div>
  )
}
