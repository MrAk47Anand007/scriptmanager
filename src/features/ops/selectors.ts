import type { RootState } from '@/store/store'

// Primitive selectors — safe to use directly, no new object created
export const selectOpsProjects = (state: RootState) => state.ops.projects
export const selectSelectedProfileId = (state: RootState) => state.ops.selectedProfileId
export const selectServerProfiles = (state: RootState) => state.ops.serverProfiles
export const selectRemoteExecStatus = (state: RootState) => state.ops.remoteExecStatus
export const selectRemoteExecOutput = (state: RootState) => state.ops.remoteExecOutput
export const selectConnectionTestResult = (state: RootState) => state.ops.connectionTestResult
export const selectCurrentRemoteExecId = (state: RootState) => state.ops.currentRemoteExecId
export const selectRequiresApproval = (state: RootState) => state.ops.requiresApproval
export const selectPendingApprovalEnvironment = (state: RootState) => state.ops.pendingApprovalEnvironment
export const selectAuditLog = (state: RootState) => state.ops.auditLog
export const selectAuditLogTotal = (state: RootState) => state.ops.auditLogTotal
export const selectAuditLogStatus = (state: RootState) => state.ops.auditLogStatus
