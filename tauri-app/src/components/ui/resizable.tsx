
import * as React from "react"
import { Group, Panel, Separator } from "react-resizable-panels"
import { GripVertical, GripHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

type Orientation = "horizontal" | "vertical"

interface ResizablePanelGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation: Orientation
  children: React.ReactNode
}

function toPercent(value?: number): string | undefined {
  return value === undefined ? undefined : `${value}%`
}

function ResizablePanelGroup({
  orientation,
  className,
  children,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      orientation={orientation}
      className={cn("h-full w-full", className)}
      {...props}
    >
      {children}
    </Group>
  )
}

interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultSize: number
  minSize?: number
  maxSize?: number
  children: React.ReactNode
}

function ResizablePanel({
  defaultSize,
  minSize,
  maxSize,
  className,
  children,
  ...props
}: ResizablePanelProps) {
  return (
    <Panel
      defaultSize={toPercent(defaultSize)}
      minSize={toPercent(minSize)}
      maxSize={toPercent(maxSize)}
      className={cn("min-h-0 min-w-0 overflow-hidden", className)}
      {...props}
    >
      {children}
    </Panel>
  )
}

interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  withHandle?: boolean
  orientation?: Orientation
}

function ResizableHandle({
  withHandle = false,
  orientation = "horizontal",
  className,
  ...props
}: ResizableHandleProps) {
  const isHorizontal = orientation === "horizontal"

  return (
    <Separator
      className={cn(
        "group relative shrink-0 bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60",
        isHorizontal
          ? "w-3 cursor-col-resize touch-none"
          : "h-3 cursor-row-resize touch-none",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center",
          isHorizontal ? "w-3" : "h-3"
        )}
      >
        <div
          className={cn(
            "rounded-full bg-slate-200 transition-all duration-150 group-hover:bg-blue-400/70 group-data-[separator=hover]:bg-blue-400/70 group-data-[separator=active]:bg-blue-500/80 dark:bg-slate-700/80 dark:group-hover:bg-blue-500/70 dark:group-data-[separator=hover]:bg-blue-500/70 dark:group-data-[separator=active]:bg-blue-400/90",
            isHorizontal ? "h-full w-px" : "h-px w-full",
            withHandle && (isHorizontal ? "h-8 w-[2px]" : "h-[2px] w-8")
          )}
        />
        {withHandle && (
          <div
            className={cn(
              "absolute flex items-center justify-center rounded-sm border border-slate-200 bg-white shadow-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-data-[separator=hover]:opacity-100 group-data-[separator=active]:opacity-100 dark:border-slate-600 dark:bg-slate-800",
              isHorizontal ? "h-8 w-[14px]" : "h-[14px] w-8"
            )}
          >
            {isHorizontal ? (
              <GripVertical className="h-3 w-3 text-slate-400 dark:text-slate-500" />
            ) : (
              <GripHorizontal className="h-3 w-3 text-slate-400 dark:text-slate-500" />
            )}
          </div>
        )}
      </div>
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
