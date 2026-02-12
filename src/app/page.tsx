'use client'

import { useState, useEffect } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { fetchScripts, fetchCollections } from '@/features/scripts/scriptsSlice'
import { fetchSettings } from '@/features/settings/settingsSlice'
import { ScriptsManager } from '@/components/ScriptsManager'
import { SettingsManager } from '@/components/SettingsManager'
import { Settings, Code2 } from 'lucide-react'

export default function Home() {
  const dispatch = useAppDispatch()
  const [activeTab, setActiveTab] = useState<'scripts' | 'settings'>('scripts')

  // Centralized initial data fetching — done once on mount
  useEffect(() => {
    dispatch(fetchScripts())
    dispatch(fetchCollections())
    dispatch(fetchSettings())
  }, [dispatch])

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav */}
      <header className="border-b bg-white px-4 h-10 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <Code2 className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-sm text-slate-800">ScriptManager</span>
        </div>
        <nav className="flex gap-1">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === 'scripts'
                ? 'bg-slate-100 text-slate-900 font-medium'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
          >
            Scripts
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'settings'
                ? 'bg-slate-100 text-slate-900 font-medium'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
          >
            <Settings className="h-3 w-3" />
            Settings
          </button>
        </nav>
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
