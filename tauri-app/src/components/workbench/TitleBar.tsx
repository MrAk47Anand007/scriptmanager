

import { Code2, Search } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setAutoSaveEnabled } from '@/features/scripts/scriptsSlice'
import { selectAutoSaveEnabled } from '@/features/scripts/selectors'
import { ModeToggle } from '@/components/ModeToggle'
import { OpsModeToggle } from '@/components/OpsModeToggle'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { isDesktopRenderer } from '@/lib/runtime/desktopMode'
import { WindowControls } from './WindowControls'
import { setPaletteOpen } from '@/features/workbench/workbenchSlice'

export function TitleBar() {
  const dispatch = useAppDispatch()
  const autoSaveEnabled = useAppSelector(selectAutoSaveEnabled)
  const isDesktopShell = isDesktopRenderer()

  const toggleAutoSave = (enabled: boolean) => {
    dispatch(setAutoSaveEnabled(enabled))
    localStorage.setItem('scriptManager_autoSave', String(enabled))
  }

  const openCommandPalette = () => {
    dispatch(setPaletteOpen(true))
  }

  return (
    <header
      data-tauri-drag-region={isDesktopShell ? '' : undefined}
      className={`desktop-titlebar flex shrink-0 select-none items-center gap-3 border-b border-wb-border bg-wb-titlebar pl-4 ${
        isDesktopShell ? 'h-11' : 'h-9 pr-4'
      }`}
    >
      <div data-tauri-drag-region={isDesktopShell ? '' : undefined} className="mr-2 flex h-full min-w-0 items-center gap-2">
        <Code2 className="pointer-events-none h-5 w-5 shrink-0 text-accent-brand" />
        <span className="pointer-events-none truncate text-sm font-semibold text-foreground">ScriptManager</span>
      </div>

      <div data-tauri-drag-region={isDesktopShell ? '' : undefined} className="flex h-full min-w-0 flex-1 items-center justify-center px-2">
        <button
          type="button"
          onClick={openCommandPalette}
          className="wb-transition desktop-no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-wb-border bg-background/60 px-3 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          title="Command palette (Ctrl+P)"
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="truncate">Search commands, scripts and requests…</span>
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
      {isDesktopShell && <WindowControls />}
    </header>
  )
}
