'use client'

import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { toggleOpsMode } from '@/features/ops/opsSlice'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Server } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OpsModeToggle() {
    const dispatch = useAppDispatch()
    const isModeActive = useAppSelector((state) => state.ops.isModeActive)

    const handleToggle = (enabled: boolean) => {
        dispatch(toggleOpsMode())
        localStorage.setItem('scriptManager_opsMode', String(enabled))
    }

    return (
        <div className="flex items-center gap-2" title="Enable Ops Mode for SSH/server automation and project organization">
            <Label
                htmlFor="ops-mode-toggle"
                className={cn(
                    "text-xs cursor-pointer flex items-center gap-1 transition-colors",
                    isModeActive
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : "text-slate-600 dark:text-slate-400"
                )}
            >
                <Server className="h-3 w-3" />
                Ops
            </Label>
            <Switch
                id="ops-mode-toggle"
                checked={isModeActive}
                onCheckedChange={handleToggle}
                className={cn("h-4 w-7", isModeActive && "data-[state=checked]:bg-amber-500")}
            />
        </div>
    )
}
