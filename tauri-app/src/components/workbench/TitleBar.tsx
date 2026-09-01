

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
import { setPaletteOpen } from '@/features/workbench/workbenchSlice'

export function TitleBar() {
  const dispatch = useAppDispatch()
  const autoSaveEnabled = useAppSelector(selectAutoSaveEnabled)
  const [isDesktopShell, setIsDesktopShell] = useState(false)

  useEffect(() => {
    setIsDesktopShell(isDesktop())
  }, [])

  const toggleAutoSave = (enabled: boolean) => {
    dispatch(setAutoSaveEnabled(enabled))
    localStorage.setItem('scriptManager_autoSave', String(enabled))
  }

  const openCommandPalette = () => {
    dispatch(setPaletteOpen(true))
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
    </header>
  )
}
