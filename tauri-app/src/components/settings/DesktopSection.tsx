
import React, { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell } from 'lucide-react'

export const DesktopSection = () => {
    const [notificationsEnabled, setNotificationsEnabled] = useState(true)

    useEffect(() => {
        setNotificationsEnabled(localStorage.getItem('scriptManager_notifications') !== 'false')
    }, [])

    const handleNotificationsToggle = (enabled: boolean) => {
        setNotificationsEnabled(enabled)
        localStorage.setItem('scriptManager_notifications', String(enabled))
        void window.scriptManagerDesktop?.setNotificationsEnabled?.(enabled)
    }

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Desktop</h2>
                <p className="text-muted-foreground">Preferences for the ScriptManager desktop app.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle>
                    <CardDescription>
                        Control native notifications shown by the desktop app.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between space-x-2">
                        <div className="space-y-0.5">
                            <Label htmlFor="desktop_notifications">Desktop notifications</Label>
                            <p className="text-xs text-muted-foreground">
                                Show a native notification when a script finishes while the window is in the background.
                            </p>
                        </div>
                        <Switch
                            id="desktop_notifications"
                            checked={notificationsEnabled}
                            onCheckedChange={handleNotificationsToggle}
                        />
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
