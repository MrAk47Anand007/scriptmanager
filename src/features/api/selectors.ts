import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectApiCollections = (state: RootState) => state.api.collections
export const selectApiEnvironments = (state: RootState) => state.api.environments
export const selectApiGlobalVariables = (state: RootState) => state.api.globalVariables
export const selectApiActiveEnvironmentId = (state: RootState) => state.api.activeEnvironmentId
export const selectApiRequests = (state: RootState) => state.api.requests
export const selectApiActiveRequestId = (state: RootState) => state.api.activeRequestId
export const selectApiActiveRequest = (state: RootState) => state.api.activeRequest
export const selectApiResponse = (state: RootState) => state.api.response
export const selectApiHistory = (state: RootState) => state.api.history
export const selectApiCollectionRuns = (state: RootState) => state.api.collectionRuns
export const selectApiActiveCollectionRun = (state: RootState) => state.api.activeCollectionRun
export const selectApiIsLoading = (state: RootState) => state.api.isLoading
export const selectApiIsSending = (state: RootState) => state.api.isSending
export const selectApiIsRunningCollection = (state: RootState) => state.api.isRunningCollection
export const selectApiError = (state: RootState) => state.api.error
