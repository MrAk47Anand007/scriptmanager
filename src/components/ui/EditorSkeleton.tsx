'use client'

export const EditorSkeleton = () => (
    <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
        <div className="flex flex-col gap-2 w-full px-6 py-4 animate-pulse">
            {Array.from({ length: 12 }).map((_, i) => (
                <div
                    key={i}
                    className="h-3 rounded bg-slate-700/60"
                    style={{ width: `${30 + ((i * 37 + 17) % 55)}%` }}
                />
            ))}
        </div>
    </div>
)
