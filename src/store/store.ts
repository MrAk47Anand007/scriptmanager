import { configureStore } from '@reduxjs/toolkit'
import scriptsReducer from '@/features/scripts/scriptsSlice'
import settingsReducer from '@/features/settings/settingsSlice'

export const makeStore = () =>
  configureStore({
    reducer: {
      scripts: scriptsReducer,
      settings: settingsReducer,
    },
  })

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
