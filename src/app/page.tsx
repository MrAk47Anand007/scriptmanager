'use client'

import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchScripts, fetchCollections, fetchTemplates, fetchAllTags, setAutoSaveEnabled } from '@/features/scripts/scriptsSlice'
import { fetchSettings } from '@/features/settings/settingsSlice'
import { setOpsMode, fetchProjects, fetchServerProfiles } from '@/features/ops/opsSlice'
import { ScriptsManager } from '@/components/ScriptsManager'
import { SettingsManager } from '@/components/SettingsManager'
import { Settings, Code2 } from 'lucide-react'
import { ModeToggle } from '@/components/ModeToggle'
import { OpsModeToggle } from '@/components/OpsModeToggle'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export default function Home() {
  const dispatch = useAppDispatch()
  const { autoSaveEnabled } = useAppSelector((state) => state.scripts)
  const [activeTab, setActiveTab] = useState<'scripts' | 'settings'>('scripts')

  // Centralized initial data fetching — done once on mount
  useEffect(() => {
    dispatch(fetchScripts())
    dispatch(fetchCollections())
    dispatch(fetchSettings())
    dispatch(fetchTemplates())
    dispatch(fetchAllTags())

    // Load auto-save preference
    const stored = localStorage.getItem('scriptManager_autoSave')
    if (stored) {
      dispatch(setAutoSaveEnabled(stored === 'true'))
    }

    // Load ops mode preference
    const storedOpsMode = localStorage.getItem('scriptManager_opsMode')
    if (storedOpsMode) {
      dispatch(setOpsMode(storedOpsMode === 'true'))
    }

    // Load ops mode data
    dispatch(fetchProjects())
    dispatch(fetchServerProfiles())
  }, [dispatch])

  const toggleAutoSave = (enabled: boolean) => {
    dispatch(setAutoSaveEnabled(enabled))
    localStorage.setItem('scriptManager_autoSave', String(enabled))
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav */}
      <header className="border-b bg-white dark:bg-slate-950 dark:border-slate-800 px-4 h-10 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <Code2 className="h-5 w-5 text-blue-600 dark:text-blue-500" />
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">ScriptManager</span>
        </div>
        <nav className="flex gap-1">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === 'scripts'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
          >
            Scripts
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'settings'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
          >
            <Settings className="h-3 w-3" />
            Settings
          </button>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2" title="Auto-save changes">
            <Label htmlFor="auto-save-toggle" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">AutoSave</Label>
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

      {/* Main content — CSS display toggle preserves component state across tab switches */}
      <main className="flex-1 overflow-hidden">
        <div className={activeTab === 'scripts' ? 'h-full' : 'hidden'}>
          <ScriptsManager />
        </div>
        <div className={activeTab === 'settings' ? 'h-full overflow-y-auto' : 'hidden'}>
          <SettingsManager />
        </div>
      </main>
    </div>
  )
}
