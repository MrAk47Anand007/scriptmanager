import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectOpsProjects = (state: RootState) => state.ops.projects
