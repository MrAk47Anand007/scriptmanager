"use client"

import * as React from "react"
import { GripVertical } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"
import { cn } from "@/lib/utils"

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Group>) => (
  <ResizablePrimitive.Group
    className={cn(
      "flex h-full w-full aria-[orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
)
ResizablePanelGroup.displayName = "ResizablePanelGroup"

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.Separator
    className={cn(
      "relative flex items-center justify-center transition-colors",
      "bg-slate-200 hover:bg-blue-400 dark:bg-slate-700 dark:hover:bg-blue-500",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400",
      "data-[orientation=horizontal]:w-1 data-[orientation=horizontal]:cursor-col-resize",
      "data-[orientation=vertical]:h-1 data-[orientation=vertical]:w-full data-[orientation=vertical]:cursor-row-resize",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800 shadow-sm">
        <GripVertical className="h-2.5 w-2.5 text-slate-400" />
      </div>
    )}
  </ResizablePrimitive.Separator>
)
ResizableHandle.displayName = "ResizableHandle"

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
