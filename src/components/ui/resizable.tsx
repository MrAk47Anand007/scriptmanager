"use client"

import * as React from "react"
import { GripVertical, GripHorizontal } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"
import { cn } from "@/lib/utils"

// NOTE: react-resizable-panels v4 sets data-separator / data-panel / data-group
// on DOM elements — it does NOT set data-orientation or aria-orientation.
// All orientation-based styling must be driven by explicit props, not CSS attribute selectors.

const ResizablePanelGroup = ({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    orientation={orientation}
    className={cn(
      "flex h-full w-full",
      // The library manages panel sizes via inline CSS vars, but the flex
      // direction on the container still needs to be correct for proper layout.
      orientation === "vertical" ? "flex-col" : "flex-row",
      className
    )}
    {...props}
  />
)
ResizablePanelGroup.displayName = "ResizablePanelGroup"

const ResizablePanel = ResizablePrimitive.Panel
ResizablePanel.displayName = "ResizablePanel"

// ─── ResizableHandle ─────────────────────────────────────────────────────────
//
// orientation="horizontal" → handle sits between left/right panels → vertical bar → col-resize
// orientation="vertical"   → handle sits between top/bottom panels → horizontal bar → row-resize

interface ResizableHandleProps
  extends React.ComponentProps<typeof ResizablePrimitive.Separator> {
  withHandle?: boolean
  /** Must match the orientation of the parent ResizablePanelGroup. */
  orientation?: "horizontal" | "vertical"
}

const ResizableHandle = ({
  withHandle = false,
  orientation = "horizontal",
  className,
  ...props
}: ResizableHandleProps) => {
  const isCol = orientation === "horizontal" // vertical bar / col-resize
  return (
    <ResizablePrimitive.Separator
      className={cn(
        // Hit area — wide/tall enough to grab comfortably
        "relative shrink-0 flex items-center justify-center",
        "select-none outline-none focus-visible:outline-none",
        "group/handle transition-colors",
        isCol
          ? "w-[6px] min-w-[6px] h-full cursor-col-resize"
          : "h-[6px] min-h-[6px] w-full cursor-row-resize",
        className
      )}
      {...props}
    >
      {/* Visual separator line — thin at rest, slightly wider + blue on hover */}
      <div
        className={cn(
          "absolute pointer-events-none transition-all duration-150",
          isCol
            ? [
                "inset-y-0 left-1/2 -translate-x-1/2",
                "w-px bg-slate-200 dark:bg-slate-700/80",
                "group-hover/handle:w-[2px] group-hover/handle:bg-blue-400/70 dark:group-hover/handle:bg-blue-500/70",
              ]
            : [
                "inset-x-0 top-1/2 -translate-y-1/2",
                "h-px bg-slate-200 dark:bg-slate-700/80",
                "group-hover/handle:h-[2px] group-hover/handle:bg-blue-400/70 dark:group-hover/handle:bg-blue-500/70",
              ]
        )}
      />

      {/* Grip pill — semi-transparent at rest, fully visible on hover */}
      {withHandle && (
        <div
          className={cn(
            "z-10 relative flex items-center justify-center rounded-sm",
            "bg-white dark:bg-slate-800",
            "border border-slate-200 dark:border-slate-600 shadow-sm",
            "opacity-40 group-hover/handle:opacity-100 transition-opacity duration-150",
            isCol ? "h-8 w-[15px]" : "h-[15px] w-8"
          )}
        >
          {isCol ? (
            <GripVertical className="h-3 w-3 text-slate-400 dark:text-slate-500" />
          ) : (
            <GripHorizontal className="h-3 w-3 text-slate-400 dark:text-slate-500" />
          )}
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}
ResizableHandle.displayName = "ResizableHandle"

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
