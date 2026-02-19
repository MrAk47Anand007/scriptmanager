import { configureStore } from '@reduxjs/toolkit'
import scriptsReducer from '@/features/scripts/scriptsSlice'
import settingsReducer from '@/features/settings/settingsSlice'
import opsReducer from '@/features/ops/opsSlice'

export const makeStore = () =>
  configureStore({
    reducer: {
      scripts: scriptsReducer,
      settings: settingsReducer,
      ops: opsReducer,
    },
  })

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
