import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectActiveActivity = (state: RootState) => state.workbench.activeActivity
export const selectSidePanelVisible = (state: RootState) => state.workbench.sidePanelVisible
export const selectDockVisible = (state: RootState) => state.workbench.dockVisible
export const selectActiveDockTab = (state: RootState) => state.workbench.activeDockTab
export const selectTabs = (state: RootState) => state.workbench.tabs
export const selectActiveTabId = (state: RootState) => state.workbench.activeTabId
export const selectPaletteOpen = (state: RootState) => state.workbench.paletteOpen
