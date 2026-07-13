'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo, startTransition } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchScripts, fetchCollections, fetchTemplates, fetchAllTags, setAutoSaveEnabled } from '@/features/scripts/scriptsSlice'
import { fetchSettings } from '@/features/settings/settingsSlice'
import { selectIsModeActive } from '@/features/ops/selectors'
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
import { WorkbenchShell } from '@/components/workbench/WorkbenchShell'
import { ActivityBar } from '@/components/workbench/ActivityBar'
import { SidePanel } from '@/components/workbench/SidePanel'
import { selectActiveActivity, selectTabs, selectActiveTabId } from '@/features/workbench/selectors'
import { EditorTabs } from '@/components/workbench/EditorTabs'
import { useTabSync } from '@/components/workbench/tabSync'
import { BottomDock } from '@/components/workbench/BottomDock'

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

const SchedulesView = dynamic(
  () => import('@/components/SchedulesView').then((mod) => mod.SchedulesView),
  {
    loading: () => <SectionSkeleton label="Loading schedules" />,
  }
)

const SettingsManager = dynamic(
  () => import('@/components/SettingsManager').then((mod) => mod.SettingsManager),
  {
    loading: () => <SectionSkeleton label="Loading settings" />,
  }
)

const OpsView = dynamic(
  () => import('@/components/OpsView').then((mod) => mod.OpsView),
  {
    loading: () => <SectionSkeleton label="Loading ops console" />,
  }
)
const WorkflowBuilder = dynamic(() => import('@/components/workflows/WorkflowBuilder').then((mod) => mod.WorkflowBuilder), { loading: () => <SectionSkeleton label="Loading workflow builder" /> })
const ExecutionDashboard = dynamic(() => import('@/components/observability/ExecutionDashboard').then((mod) => mod.ExecutionDashboard), { loading: () => <SectionSkeleton label="Loading execution dashboard" /> })

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

type TabId = 'scripts' | 'settings' | 'api' | 'workflows' | 'executions' | 'schedules' | 'ops'

export default function Home() {
  const dispatch = useAppDispatch()
  const isOpsModeActive = useAppSelector(selectIsModeActive)
  const activeActivity = useAppSelector(selectActiveActivity)
  const tabs = useAppSelector(selectTabs)
  const activeTabId = useAppSelector(selectActiveTabId)
  // Tab ↔ feature-slice sync must run here (always mounted) — EditorTabs
  // unmounts while the settings activity is active.
  useTabSync()
  // The visible editor follows the ACTIVE TAB's kind (unsaved api drafts get a
  // pseudo-tab via useTabSync, so they're covered); with no tabs, the activity
  // decides (api activity shows the api empty state).
  const activeEditorKind =
    tabs.find((t) => t.id === activeTabId)?.kind ?? (activeActivity === 'api' ? 'api' : 'script')
  const activeTab: TabId = activeActivity === 'settings'
    ? 'settings'
      : activeActivity === 'schedules'
      ? 'schedules'
      : activeActivity === 'workflows'
        ? 'workflows'
      : activeActivity === 'executions'
        ? 'executions'
      : activeActivity === 'ops'
        ? 'ops'
        : activeEditorKind === 'api' ? 'api' : 'scripts'
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [mountedTabs, setMountedTabs] = useState<Record<TabId, boolean>>({
    scripts: true,
    settings: false,
    api: false,
    schedules: false,
    ops: false,
    workflows: false,
    executions: false,
  })

  useEffect(() => {
    const desktop = typeof window !== 'undefined' && Boolean(window.__ELECTRON__)
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

  // Mount the API workspace as soon as the api activity is selected so its
  // sidebar data loads even before an api tab is opened.
  useEffect(() => {
    if (activeActivity !== 'api') return
    setMountedTabs((current) => current.api ? current : { ...current, api: true })
  }, [activeActivity])

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
  const schedulesPanelClassName = useMemo(
    () => activeTab === 'schedules'
      ? 'absolute inset-0 opacity-100 z-10'
      : 'absolute inset-0 opacity-0 pointer-events-none -z-10',
    [activeTab]
  )
  const opsPanelClassName = useMemo(
    () => activeTab === 'ops'
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
  const workflowsPanelClassName = useMemo(() => activeTab === 'workflows' ? 'absolute inset-0 opacity-100 z-10' : 'absolute inset-0 opacity-0 pointer-events-none -z-10', [activeTab])
  const executionsPanelClassName = useMemo(() => activeTab === 'executions' ? 'absolute inset-0 opacity-100 z-10' : 'absolute inset-0 opacity-0 pointer-events-none -z-10', [activeTab])

  return (
    <WorkbenchShell
      activityBar={<ActivityBar />}
      sidePanel={<SidePanel />}
      dock={<BottomDock />}
    >
      <div className="flex h-full flex-col">
        {isBootstrapping && (
          <div className="h-0.5 shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-800">
            <div className="h-full w-full animate-pulse bg-gradient-to-r from-blue-500 via-blue-300 to-blue-500" />
          </div>
        )}
        {activeTab !== 'settings' && activeTab !== 'schedules' && activeTab !== 'ops' && activeTab !== 'workflows' && activeTab !== 'executions' && <EditorTabs />}
        <main className="relative flex-1 overflow-hidden">
          {mountedTabs.scripts && (
            <div className={scriptsPanelClassName}>
              {isBootstrapping ? <SectionSkeleton label="Preparing scripts workspace" /> : <ScriptsManager hideSidebar />}
            </div>
          )}
          {mountedTabs.api && (
            <div className={apiPanelClassName}>
              <ApiManager hideSidebar />
            </div>
          )}
          {mountedTabs.schedules && (
            <div className={schedulesPanelClassName}>
              <SchedulesView />
            </div>
          )}
          {mountedTabs.ops && (
            <div className={opsPanelClassName}>
              <OpsView />
            </div>
          )}
          {mountedTabs.workflows && <div className={workflowsPanelClassName}><WorkflowBuilder /></div>}
          {mountedTabs.executions && <div className={executionsPanelClassName}><ExecutionDashboard /></div>}
          {mountedTabs.settings && (
            <div className={settingsPanelClassName}>
              <SettingsManager />
            </div>
          )}
        </main>
      </div>
    </WorkbenchShell>
  )
}
