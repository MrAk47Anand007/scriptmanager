import { configureStore } from '@reduxjs/toolkit'
import scriptsReducer from '@/features/scripts/scriptsSlice'
import settingsReducer from '@/features/settings/settingsSlice'
import opsReducer from '@/features/ops/opsSlice'
import apiReducer from '@/features/api/apiSlice'
import workbenchReducer from '@/features/workbench/workbenchSlice'

export const makeStore = () =>
  configureStore({
    reducer: {
      scripts: scriptsReducer,
      settings: settingsReducer,
      ops: opsReducer,
      api: apiReducer,
      workbench: workbenchReducer,
    },
  })

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
