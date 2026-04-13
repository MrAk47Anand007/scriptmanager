'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo, startTransition } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchScripts, fetchCollections, fetchTemplates, fetchAllTags, setAutoSaveEnabled } from '@/features/scripts/scriptsSlice'
import { fetchSettings } from '@/features/settings/settingsSlice'
import { hasDesktopScriptsRuntime, listDesktopCollections, listDesktopScripts } from '@/lib/scriptsRuntimeClient'

/** Single round-trip to hydrate scripts + collections + settings on startup */
async function loadBootstrap(dispatch: ReturnType<typeof import('@/store/hooks').useAppDispatch>) {
  try {
    if (typeof window !== 'undefined' && hasDesktopScriptsRuntime()) {
      const [scripts, collections] = await Promise.all([
        listDesktopScripts(),
        listDesktopCollections(),
      ])

      dispatch(fetchScripts.fulfilled(scripts, 'desktop-bootstrap', undefined))
      dispatch(fetchCollections.fulfilled(collections, 'desktop-bootstrap', undefined))
      await dispatch(fetchSettings())
      return
    }

    const res = await fetch('/api/bootstrap')
    if (!res.ok) throw new Error('bootstrap failed')
    const data = await res.json()
    // Reuse existing fulfilled reducers so cache invalidation logic stays in one place
    dispatch(fetchScripts.fulfilled(data.scripts, 'bootstrap', undefined))
    dispatch(fetchCollections.fulfilled(data.collections, 'bootstrap', undefined))
    dispatch(fetchSettings.fulfilled(data.settings, 'bootstrap', undefined))
  } catch {
    // Fall back to individual fetches if bootstrap endpoint is unavailable
    await Promise.all([
      dispatch(fetchScripts()),
      dispatch(fetchCollections()),
      dispatch(fetchSettings()),
    ])
  }
}
import { setOpsMode, fetchProjects, fetchServerProfiles } from '@/features/ops/opsSlice'
import { fetchApiCollections, fetchApiRequests } from '@/features/api/apiSlice'
import { Settings, Code2, Globe, SquareTerminal } from 'lucide-react'
import { ModeToggle } from '@/components/ModeToggle'
import { OpsModeToggle } from '@/components/OpsModeToggle'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

const ScriptsManager = dynamic(
  () => import('@/components/ScriptsManager').then((mod) => mod.ScriptsManager),
  {
    loading: () => <SectionSkeleton label="Loading scripts workspace" />,
  }
)

const ApiManager = dynamic(
  () => import('@/components/api/ApiManager').then((mod) => mod.ApiManager),
  {
    loading: () => <SectionSkeleton label="Loading API workspace" />,
  }
)

const SettingsManager = dynamic(
  () => import('@/components/SettingsManager').then((mod) => mod.SettingsManager),
  {
    loading: () => <SectionSkeleton label="Loading settings" />,
  }
)

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-slate-950">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
        {label}
      </div>
    </div>
  )
}

function scheduleIdleWork(callback: () => void, delay = 180) {
  if (typeof window === 'undefined') {
    callback()
    return () => undefined
  }

  const idleWindow = window as Window & typeof globalThis

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const id = idleWindow.requestIdleCallback(() => callback(), { timeout: 1200 })
    return () => idleWindow.cancelIdleCallback(id)
  }

  const timeoutId = globalThis.setTimeout(callback, delay)
  return () => globalThis.clearTimeout(timeoutId)
}

export default function Home() {
  const dispatch = useAppDispatch()
  const autoSaveEnabled = useAppSelector((state) => state.scripts.autoSaveEnabled)
  const isOpsModeActive = useAppSelector((state) => state.ops.isModeActive)
  const [isDesktopShell, setIsDesktopShell] = useState(false)
  const [activeTab, setActiveTab] = useState<'scripts' | 'settings' | 'api'>('scripts')
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [mountedTabs, setMountedTabs] = useState<Record<'scripts' | 'settings' | 'api', boolean>>({
    scripts: true,
    settings: false,
    api: false,
  })

  useEffect(() => {
    const desktop = typeof window !== 'undefined' && Boolean(window.__ELECTRON__)
    setIsDesktopShell(desktop)
    if (typeof document !== 'undefined') {
      if (desktop) {
        document.body.dataset.electron = 'true'
      } else {
        delete document.body.dataset.electron
      }
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const bootstrapStartedAt = Date.now()

    void (async () => {
      await loadBootstrap(dispatch)
      const elapsed = Date.now() - bootstrapStartedAt
      const remainingDelay = Math.max(0, 250 - elapsed)
      if (remainingDelay > 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, remainingDelay))
      }
      if (!isCancelled) {
        setIsBootstrapping(false)
      }
    })()

    const stored = localStorage.getItem('scriptManager_autoSave')
    if (stored) {
      dispatch(setAutoSaveEnabled(stored === 'true'))
    }

    const storedOpsMode = localStorage.getItem('scriptManager_opsMode')
    if (storedOpsMode) {
      dispatch(setOpsMode(storedOpsMode === 'true'))
    }

    const cancelBackgroundScripts = scheduleIdleWork(() => {
      if (isCancelled) {
        return
      }

      startTransition(() => {
        void dispatch(fetchTemplates())
        void dispatch(fetchAllTags())
      })
    })

    return () => {
      isCancelled = true
      cancelBackgroundScripts()
    }
  }, [dispatch])

  useEffect(() => {
    const nextActiveTab = activeTab
    setMountedTabs((current) => current[nextActiveTab] ? current : { ...current, [nextActiveTab]: true })
  }, [activeTab])

  useEffect(() => {
    if (!mountedTabs.api) {
      return
    }

    const cancelApiBoot = scheduleIdleWork(() => {
      startTransition(() => {
        void dispatch(fetchApiCollections())
        void dispatch(fetchApiRequests())
      })
    }, activeTab === 'api' ? 0 : 220)

    return cancelApiBoot
  }, [activeTab, dispatch, mountedTabs.api])

  useEffect(() => {
    if (!isOpsModeActive) {
      return
    }

    const cancelOpsBoot = scheduleIdleWork(() => {
      startTransition(() => {
        void dispatch(fetchProjects())
        void dispatch(fetchServerProfiles())
      })
    }, activeTab === 'scripts' ? 80 : 180)

    return cancelOpsBoot
  }, [activeTab, dispatch, isOpsModeActive])

  const toggleAutoSave = (enabled: boolean) => {
    dispatch(setAutoSaveEnabled(enabled))
    localStorage.setItem('scriptManager_autoSave', String(enabled))
  }

  const scriptsPanelClassName = useMemo(
    () => activeTab === 'scripts'
      ? 'absolute inset-0 opacity-100 z-10'
      : 'absolute inset-0 opacity-0 pointer-events-none -z-10',
    [activeTab]
  )
  const apiPanelClassName = useMemo(
    () => activeTab === 'api'
      ? 'absolute inset-0 opacity-100 z-10'
      : 'absolute inset-0 opacity-0 pointer-events-none -z-10',
    [activeTab]
  )
  const settingsPanelClassName = useMemo(
    () => activeTab === 'settings'
      ? 'absolute inset-0 overflow-y-auto bg-white dark:bg-slate-950 opacity-100 z-10'
      : 'absolute inset-0 opacity-0 pointer-events-none -z-10',
    [activeTab]
  )

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav */}
      <header className={`desktop-titlebar border-b bg-white dark:bg-slate-950/95 dark:border-slate-800 px-4 ${isDesktopShell ? 'h-11 pr-40' : 'h-10'} flex items-center gap-4 shrink-0`}>
        <div className="desktop-no-drag flex items-center gap-2 mr-4 min-w-0">
          <Code2 className="h-5 w-5 text-blue-600 dark:text-blue-500" />
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">ScriptManager</span>
        </div>
        <nav className="desktop-no-drag flex gap-1">
          <button
            onClick={() => setActiveTab('scripts')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${activeTab === 'scripts'
              ? 'bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 font-medium shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/80'
              }`}
          >
            Scripts
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${activeTab === 'api'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
          >
            <Globe className="h-3 w-3" />
            API
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
          {isDesktopShell && (
            <button
              onClick={() => {
                setActiveTab('scripts')
                window.dispatchEvent(new CustomEvent('scriptmanager:open-terminal'))
              }}
              className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <SquareTerminal className="h-3 w-3" />
              Terminal
            </button>
          )}
        </nav>
        <div className={`desktop-no-drag ml-auto flex items-center ${isDesktopShell ? 'gap-3' : 'gap-4'} min-w-0`}>
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
      {isBootstrapping && (
        <div className="h-0.5 overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
          <div className="h-full w-full animate-pulse bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />
        </div>
      )}

      <main className="flex-1 overflow-hidden relative">
        {mountedTabs.scripts && (
          <div className={scriptsPanelClassName}>
            {isBootstrapping ? <SectionSkeleton label="Preparing scripts workspace" /> : <ScriptsManager />}
          </div>
        )}
        {mountedTabs.api && (
          <div className={apiPanelClassName}>
            <ApiManager />
          </div>
        )}
        {mountedTabs.settings && (
          <div className={settingsPanelClassName}>
            <SettingsManager />
          </div>
        )}
      </main>
    </div>
  )
}

