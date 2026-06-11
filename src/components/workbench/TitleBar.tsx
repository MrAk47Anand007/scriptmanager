'use client'

import { useEffect, useState } from 'react'
import { Code2, Search } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setAutoSaveEnabled } from '@/features/scripts/scriptsSlice'
import { selectAutoSaveEnabled } from '@/features/scripts/selectors'
import { ModeToggle } from '@/components/ModeToggle'
import { OpsModeToggle } from '@/components/OpsModeToggle'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { isDesktop } from '@/lib/runtime'
import { setActiveActivity } from '@/features/workbench/workbenchSlice'
import { selectActiveActivity } from '@/features/workbench/selectors'

export function TitleBar() {
  const dispatch = useAppDispatch()
  const autoSaveEnabled = useAppSelector(selectAutoSaveEnabled)
  const activeActivity = useAppSelector(selectActiveActivity)
  const [isDesktopShell, setIsDesktopShell] = useState(false)

  useEffect(() => {
    setIsDesktopShell(isDesktop())
  }, [])

  const toggleAutoSave = (enabled: boolean) => {
    dispatch(setAutoSaveEnabled(enabled))
    localStorage.setItem('scriptManager_autoSave', String(enabled))
  }

  const openCommandPalette = () => {
    // QuickSwitcher lives inside ScriptsSidebar, which is hidden when another
    // activity is active — switch to scripts first so the palette is visible.
    // Guard: setActiveActivity toggles sidePanelVisible when already on scripts.
    if (activeActivity !== 'scripts') {
      dispatch(setActiveActivity('scripts'))
    }
    // QuickSwitcher is opened by the Ctrl+P keydown listener in ScriptsSidebar —
    // re-dispatch the same event so we don't duplicate open-state plumbing.
    // Defer a frame so the scripts panel mounts/paints before the event fires.
    requestAnimationFrame(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }))
    })
  }

  return (
    <header
      className={`desktop-titlebar flex shrink-0 items-center gap-4 border-b border-wb-border bg-wb-titlebar px-4 ${
        isDesktopShell ? 'h-11 pr-40' : 'h-9'
      }`}
    >
      <div className="desktop-no-drag mr-2 flex min-w-0 items-center gap-2">
        <Code2 className="h-5 w-5 text-accent-brand" />
        <span className="truncate text-sm font-semibold text-foreground">ScriptManager</span>
      </div>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={openCommandPalette}
          className="wb-transition desktop-no-drag flex h-6 w-full max-w-md items-center gap-2 rounded-md border border-wb-border bg-background/60 px-3 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          title="Go to script (Ctrl+P)"
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="truncate">Go to script…</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">Ctrl+P</span>
        </button>
      </div>

      <div className={`desktop-no-drag flex items-center ${isDesktopShell ? 'gap-3' : 'gap-4'} min-w-0`}>
        <div className="flex items-center gap-2" title="Auto-save changes">
          <Label htmlFor="auto-save-toggle" className="cursor-pointer text-xs text-muted-foreground">AutoSave</Label>
          <Switch
            id="auto-save-toggle"
            checked={autoSaveEnabled}
            onCheckedChange={toggleAutoSave}
            className="h-4 w-7"
          />
        </div>
        <OpsModeToggle />
        <ModeToggle />
      </div>
    </header>
  )
}
