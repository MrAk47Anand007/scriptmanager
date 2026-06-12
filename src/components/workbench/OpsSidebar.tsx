'use client'

import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchServerProfiles, fetchProjects, setSelectedProfile } from '@/features/ops/opsSlice'
import {
    selectServerProfiles,
    selectServerProfilesStatus,
    selectSelectedProfileId,
    selectOpsProjects,
} from '@/features/ops/selectors'
import { Server, FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'

const ENV_PILL: Record<string, string> = {
    development: 'bg-success/15 text-success',
    qa: 'bg-blue-500/15 text-blue-500',
    uat: 'bg-warning/15 text-warning',
    production: 'bg-destructive/15 text-destructive',
}

function EnvPill({ environment }: { environment: string }) {
    return (
        <span
            className={cn(
                'shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide',
                ENV_PILL[environment] ?? 'bg-accent text-muted-foreground'
            )}
        >
            {environment.slice(0, 4)}
        </span>
    )
}

/**
 * Side panel content for the 'ops' activity: server profiles + projects at a
 * glance. Selection drives the Servers tab of OpsView; management actions
 * (add/edit/test) live in the view itself.
 */
export function OpsSidebar() {
    const dispatch = useAppDispatch()
    const serverProfiles = useAppSelector(selectServerProfiles)
    const serverProfilesStatus = useAppSelector(selectServerProfilesStatus)
    const selectedProfileId = useAppSelector(selectSelectedProfileId)
    const projects = useAppSelector(selectOpsProjects)

    useEffect(() => {
        if (serverProfilesStatus === 'idle') {
            void dispatch(fetchServerProfiles())
            void dispatch(fetchProjects())
        }
    }, [dispatch, serverProfilesStatus])

    const projectEnv = (projectId: string | null) =>
        projects.find((p) => p.id === projectId)?.environment

    return (
        <div className="flex h-full flex-col overflow-y-auto px-2 py-3 text-xs">
            <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Server className="h-3 w-3" />
                Servers
            </div>
            {serverProfiles.length === 0 ? (
                <p className="px-2 py-1 italic text-muted-foreground">No server profiles yet</p>
            ) : (
                serverProfiles.map((profile) => {
                    const env = projectEnv(profile.project_id)
                    return (
                        <button
                            key={profile.id}
                            onClick={() => dispatch(setSelectedProfile(profile.id))}
                            className={cn(
                                'wb-transition flex w-full items-center gap-2 rounded px-2 py-1.5 text-left',
                                selectedProfileId === profile.id
                                    ? 'bg-blue-50 text-foreground dark:bg-blue-950/40'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{profile.name}</span>
                                <span className="block truncate font-logs text-[10px] opacity-70">
                                    {profile.username}@{profile.host}:{profile.port}
                                </span>
                            </span>
                            {env && <EnvPill environment={env} />}
                        </button>
                    )
                })
            )}

            <div className="mb-1.5 mt-4 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <FolderKanban className="h-3 w-3" />
                Projects
            </div>
            {projects.length === 0 ? (
                <p className="px-2 py-1 italic text-muted-foreground">No projects yet</p>
            ) : (
                projects.map((project) => (
                    <div key={project.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        <span className="shrink-0 text-[10px] opacity-70">{project.collection_ids.length}</span>
                        <EnvPill environment={project.environment} />
                    </div>
                ))
            )}
        </div>
    )
}
