import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectScriptItems = (state: RootState) => state.scripts.items
export const selectCollections = (state: RootState) => state.scripts.collections
export const selectActiveScriptId = (state: RootState) => state.scripts.activeScriptId
export const selectActiveScriptContent = (state: RootState) => state.scripts.activeScriptContent
export const selectBuilds = (state: RootState) => state.scripts.builds
export const selectSaveStatus = (state: RootState) => state.scripts.saveStatus
export const selectSchedule = (state: RootState) => state.scripts.schedule
export const selectContentStatus = (state: RootState) => state.scripts.contentStatus
export const selectRunStatus = (state: RootState) => state.scripts.runStatus
export const selectAllTags = (state: RootState) => state.scripts.allTags
export const selectEnvVars = (state: RootState) => state.scripts.envVars
export const selectAutoSaveEnabled = (state: RootState) => state.scripts.autoSaveEnabled
export const selectVersions = (state: RootState) => state.scripts.versions
export const selectVersionsStatus = (state: RootState) => state.scripts.versionsStatus
export const selectTemplates = (state: RootState) => state.scripts.templates
export const selectTemplatesStatus = (state: RootState) => state.scripts.templatesStatus
export const selectEnvVarsStatus = (state: RootState) => state.scripts.envVarsStatus

// Memoized derived selector — only recalculates when items or activeScriptId changes
// This prevents the auto-save effect and language-sync effect from re-running on every script update
export const selectActiveScript = createSelector(
    selectScriptItems,
    selectActiveScriptId,
    (items, activeScriptId) => items.find(s => s.id === activeScriptId) ?? null
)
