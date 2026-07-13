'use client'

import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { fetchSettings } from '@/features/settings/settingsSlice'
import { selectSettings, selectSettingsStatus, selectSettingsError } from '@/features/settings/selectors'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Bell, Loader2, Settings2, Palette, Cloud, Github, Lock, Monitor } from 'lucide-react'
import { isDesktop } from '@/lib/runtime'
import { cn } from '@/lib/utils'
import { GeneralSection } from './GeneralSection'
import { AppearanceSection } from './AppearanceSection'
import { CloudStorageSection } from './CloudStorageSection'
import { GitHubGistSection } from './GitHubGistSection'
import { SecuritySection } from './SecuritySection'
import { DesktopSection } from './DesktopSection'
import { NotificationsSection } from './NotificationsSection'

type SectionId = 'general' | 'appearance' | 'cloud-storage' | 'github-gist' | 'security' | 'notifications' | 'desktop'

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; desktopOnly?: boolean }[] = [
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'cloud-storage', label: 'Cloud Storage', icon: Cloud },
    { id: 'github-gist', label: 'GitHub Gist', icon: Github },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'desktop', label: 'Desktop', icon: Monitor, desktopOnly: true },
]

export const SettingsLayout = () => {
    const dispatch = useAppDispatch()
    const settings = useAppSelector(selectSettings)
    const status = useAppSelector(selectSettingsStatus)
    const error = useAppSelector(selectSettingsError)

    const [activeSection, setActiveSection] = useState<SectionId>('general')
    const [showDesktopSettings, setShowDesktopSettings] = useState(false)

    useEffect(() => {
        // Hydration-safe: only decide desktop-ness on the client.
        if (!isDesktop()) return
        setShowDesktopSettings(true)
    }, [])

    useEffect(() => {
        if (status === 'idle') {
            dispatch(fetchSettings())
        }
    }, [status, dispatch])

    if (status === 'loading' && Object.keys(settings).length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-accent-brand" />
            </div>
        )
    }

    const visibleSections = SECTIONS.filter((s) => !s.desktopOnly || showDesktopSettings)

    return (
        <div className="flex h-full min-h-0 text-[13px]">
            {/* Left nav rail */}
            <nav className="w-[200px] shrink-0 border-r border-wb-border bg-wb-sidepanel py-4 overflow-y-auto">
                <p className="px-4 pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Settings
                </p>
                <ul className="space-y-0.5">
                    {visibleSections.map((section) => {
                        const Icon = section.icon
                        const active = activeSection === section.id
                        return (
                            <li key={section.id}>
                                <button
                                    type="button"
                                    onClick={() => setActiveSection(section.id)}
                                    className={cn(
                                        'wb-transition relative flex w-full items-center gap-2.5 px-4 py-1.5 text-left',
                                        active
                                            ? 'text-foreground font-medium'
                                            : 'text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {active && (
                                        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-accent-brand" />
                                    )}
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span>{section.label}</span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </nav>

            {/* Right content area */}
            <div className="flex-1 min-w-0 overflow-y-auto">
                <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {activeSection === 'general' && <GeneralSection />}
                    {activeSection === 'appearance' && <AppearanceSection />}
                    {activeSection === 'cloud-storage' && <CloudStorageSection />}
                    {activeSection === 'github-gist' && <GitHubGistSection />}
                    {activeSection === 'security' && <SecuritySection />}
                    {activeSection === 'notifications' && <NotificationsSection />}
                    {activeSection === 'desktop' && showDesktopSettings && <DesktopSection />}
                </div>
            </div>
        </div>
    )
}
