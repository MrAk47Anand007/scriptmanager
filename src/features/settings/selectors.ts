import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectSettings = (state: RootState) => state.settings.settings
export const selectSettingsStatus = (state: RootState) => state.settings.status
export const selectSettingsError = (state: RootState) => state.settings.error
