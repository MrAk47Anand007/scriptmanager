import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ActivityId = 'scripts' | 'api' | 'workflows' | 'executions' | 'approvals' | 'ops' | 'schedules' | 'settings'
export type DockTabId = 'terminal' | 'output' | 'builds' | 'audit'

export interface EditorTab {
  id: string                       // `script:<id>` or `api:<requestId>`
  kind: 'script' | 'api'
  entityId: string
  title: string
  dirty: boolean
}

interface WorkbenchState {
  activeActivity: ActivityId
  sidePanelVisible: boolean
  dockVisible: boolean
  activeDockTab: DockTabId
  tabs: EditorTab[]
  activeTabId: string | null
  paletteOpen: boolean
}

const initialState: WorkbenchState = {
  activeActivity: 'scripts',
  sidePanelVisible: true,
  dockVisible: false,
  activeDockTab: 'terminal',
  tabs: [],
  activeTabId: null,
  paletteOpen: false,
}

const workbenchSlice = createSlice({
  name: 'workbench',
  initialState,
  reducers: {
    setActiveActivity(state, action: PayloadAction<ActivityId>) {
      if (state.activeActivity === action.payload) {
        state.sidePanelVisible = !state.sidePanelVisible
      } else {
        state.activeActivity = action.payload
        state.sidePanelVisible = true
      }
    },
    toggleDock(state) { state.dockVisible = !state.dockVisible },
    setDockVisible(state, action: PayloadAction<boolean>) { state.dockVisible = action.payload },
    setPaletteOpen(state, action: PayloadAction<boolean>) { state.paletteOpen = action.payload },
    setActiveDockTab(state, action: PayloadAction<DockTabId>) {
      state.activeDockTab = action.payload
      state.dockVisible = true
    },
    openTab(state, action: PayloadAction<Omit<EditorTab, 'dirty'>>) {
      if (!state.tabs.some(t => t.id === action.payload.id)) {
        state.tabs.push({ ...action.payload, dirty: false })
      }
      state.activeTabId = action.payload.id
    },
    closeTab(state, action: PayloadAction<string>) {
      const idx = state.tabs.findIndex(t => t.id === action.payload)
      if (idx === -1) return
      state.tabs.splice(idx, 1)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs[Math.min(idx, state.tabs.length - 1)]?.id ?? null
      }
    },
    setActiveTab(state, action: PayloadAction<string>) { state.activeTabId = action.payload },
    setTabDirty(state, action: PayloadAction<{ id: string; dirty: boolean }>) {
      const tab = state.tabs.find(t => t.id === action.payload.id)
      if (tab) tab.dirty = action.payload.dirty
    },
    renameTab(state, action: PayloadAction<{ id: string; title: string }>) {
      const tab = state.tabs.find(t => t.id === action.payload.id)
      if (tab) tab.title = action.payload.title
    },
  },
})

export const {
  setActiveActivity, toggleDock, setDockVisible, setActiveDockTab, setPaletteOpen,
  openTab, closeTab, setActiveTab, setTabDirty, renameTab,
} = workbenchSlice.actions
export default workbenchSlice.reducer
