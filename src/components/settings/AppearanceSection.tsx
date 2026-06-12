'use client'

import React, { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEMES = [
    { id: 'light', label: 'Light', icon: Sun, description: 'Bright and clean' },
    { id: 'dark', label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { id: 'system', label: 'System', icon: Monitor, description: 'Match your OS' },
] as const

export const AppearanceSection = () => {
    const { theme, setTheme } = useTheme()
    // Avoid hydration mismatch — theme is only known on the client.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Appearance</h2>
                <p className="text-muted-foreground">Choose how ScriptManager looks on this device.</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {THEMES.map((option) => {
                    const Icon = option.icon
                    const active = mounted && theme === option.id
                    return (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setTheme(option.id)}
                            className={cn(
                                'wb-transition relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left',
                                active
                                    ? 'border-accent-brand bg-accent-brand/5'
                                    : 'border-wb-border hover:border-accent-brand/40'
                            )}
                        >
                            {active && (
                                <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent-brand text-white">
                                    <Check className="h-3 w-3" />
                                </span>
                            )}
                            <Icon className="h-5 w-5 text-muted-foreground" />
                            <div>
                                <p className="font-medium">{option.label}</p>
                                <p className="text-xs text-muted-foreground">{option.description}</p>
                            </div>
                        </button>
                    )
                })}
            </div>
        </section>
    )
}
