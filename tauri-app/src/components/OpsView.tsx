import dynamic from '@/lib/dynamic';


import { lazy,  useEffect, useState  } from 'react'

import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchServerProfiles, fetchProjects, fetchAuditLog } from '@/features/ops/opsSlice'
import {
    selectServerProfiles,
    selectServerProfilesStatus,
    selectRequiresApproval,
    selectRemoteExecStatus,
    selectAuditLogTotal,
    selectConnectionTestResult,
} from '@/features/ops/selectors'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Server, ShieldAlert, History, PlayCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const RemoteExecutionPanel = dynamic(
    () => import('./RemoteExecutionPanel').then((mod) => mod.RemoteExecutionPanel),
    { loading: () => <PaneSkeleton label="Loading execution console" /> }
)
const ServerProfilesPanel = dynamic(
    () => import('./ServerProfilesPanel').then((mod) => mod.ServerProfilesPanel),
    { loading: () => <PaneSkeleton label="Loading servers" /> }
)
const AuditTrailPanel = dynamic(
    () => import('./AuditTrailPanel').then((mod) => mod.AuditTrailPanel),
    { loading: () => <PaneSkeleton label="Loading audit trail" /> }
)

function PaneSkeleton({ label }: { label: string }) {
    return (
        <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {label}
        </div>
    )
}

function SummaryCard({ icon: Icon, label, value, hint, tone }: {
    icon: typeof Server
    label: string
    value: string
    hint?: string
    tone?: 'default' | 'warning' | 'running'
}) {
    return (
        <div
            className={cn(
                'wb-transition flex items-center gap-3 rounded-lg border border-wb-border bg-card px-4 py-3',
                tone === 'warning' && 'border-warning/40'
            )}
        >
            <div
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                    tone === 'warning' ? 'bg-warning/15 text-warning'
                        : tone === 'running' ? 'bg-running/15 text-running'
                            : 'bg-accent text-muted-foreground'
                )}
            >
                <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
                <div className="text-lg font-semibold leading-tight text-foreground">{value}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                    {label}
                    {hint ? <span className="opacity-70"> · {hint}</span> : null}
                </div>
            </div>
        </div>
    )
}

/**
 * Ops deploy console — full editor-area view for the 'ops' activity.
 * Recomposes the existing self-contained panels (remote execution, server
 * profiles, audit trail) that previously lived in ScriptsManager's cramped
 * right column.
 */
export function OpsView() {
    const dispatch = useAppDispatch()
    const serverProfiles = useAppSelector(selectServerProfiles)
    const serverProfilesStatus = useAppSelector(selectServerProfilesStatus)
    const requiresApproval = useAppSelector(selectRequiresApproval)
    const remoteExecStatus = useAppSelector(selectRemoteExecStatus)
    const auditLogTotal = useAppSelector(selectAuditLogTotal)
    const connectionTestResult = useAppSelector(selectConnectionTestResult)
    const [activeTab, setActiveTab] = useState('execute')

    useEffect(() => {
        if (serverProfilesStatus === 'idle') {
            void dispatch(fetchServerProfiles())
            void dispatch(fetchProjects())
        }
        void dispatch(fetchAuditLog({ limit: 25, offset: 0 }))
    }, [dispatch, serverProfilesStatus])

    const isExecuting = remoteExecStatus === 'running' || remoteExecStatus === 'connecting'

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <div className="shrink-0 border-b border-wb-border px-5 pb-4 pt-5">
                <h1 className="text-sm font-semibold text-foreground">Ops Console</h1>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Remote execution, server profiles, and the audit trail in one place.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <SummaryCard
                        icon={Server}
                        label="Servers"
                        value={String(serverProfiles.length)}
                        hint={connectionTestResult?.success ? 'last test OK' : undefined}
                    />
                    <SummaryCard
                        icon={ShieldAlert}
                        label="Pending approvals"
                        value={requiresApproval ? '1' : '0'}
                        tone={requiresApproval ? 'warning' : 'default'}
                    />
                    <SummaryCard
                        icon={PlayCircle}
                        label="Execution"
                        value={isExecuting ? 'Running' : 'Idle'}
                        tone={isExecuting ? 'running' : 'default'}
                    />
                    <SummaryCard icon={History} label="Audit entries" value={String(auditLogTotal)} />
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-5 mt-3 w-fit shrink-0">
                    <TabsTrigger value="execute" className="text-xs">Execute</TabsTrigger>
                    <TabsTrigger value="servers" className="text-xs">Servers</TabsTrigger>
                    <TabsTrigger value="audit" className="text-xs">Audit</TabsTrigger>
                </TabsList>
                <TabsContent value="execute" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <div className="mx-auto max-w-3xl">
                        <RemoteExecutionPanel />
                    </div>
                </TabsContent>
                <TabsContent value="servers" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <div className="mx-auto max-w-3xl">
                        <ServerProfilesPanel />
                    </div>
                </TabsContent>
                <TabsContent value="audit" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                    <div className="mx-auto max-w-4xl">
                        <AuditTrailPanel />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}

