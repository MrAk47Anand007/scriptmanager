"use client"

import * as React from "react"
import { useRef, useState, useCallback, useEffect } from "react"
import { GripVertical, GripHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type Orientation = "horizontal" | "vertical"

interface PanelGroupContextValue {
  orientation: Orientation
  registerPanel: (id: string, config: PanelConfig) => void
  unregisterPanel: (id: string) => void
}

interface PanelConfig {
  defaultSize: number
  minSize?: number
  maxSize?: number
}

const PanelGroupContext = React.createContext<PanelGroupContextValue | null>(null)

// ─── ResizablePanelGroup ──────────────────────────────────────────────────────

interface ResizablePanelGroupProps {
  orientation: Orientation
  className?: string
  children: React.ReactNode
}

function ResizablePanelGroup({ orientation, className, children }: ResizablePanelGroupProps) {
  const panelsRef = useRef<Map<string, PanelConfig>>(new Map())

  const registerPanel = useCallback((id: string, config: PanelConfig) => {
    panelsRef.current.set(id, config)
  }, [])

  const unregisterPanel = useCallback((id: string) => {
    panelsRef.current.delete(id)
  }, [])

  return (
    <PanelGroupContext.Provider value={{ orientation, registerPanel, unregisterPanel }}>
      <div
        className={cn(
          "flex h-full w-full overflow-hidden",
          orientation === "vertical" ? "flex-col" : "flex-row",
          className
        )}
      >
        {children}
      </div>
    </PanelGroupContext.Provider>
  )
}
ResizablePanelGroup.displayName = "ResizablePanelGroup"

// ─── ResizablePanel ───────────────────────────────────────────────────────────

interface ResizablePanelProps {
  defaultSize: number
  minSize?: number
  maxSize?: number
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
}

function ResizablePanel({
  defaultSize,
  minSize,
  maxSize,
  className,
  children,
  style,
}: ResizablePanelProps) {
  return (
    <div
      className={cn("overflow-hidden min-w-0", className)}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: `${defaultSize}%`,
        minWidth: minSize !== undefined ? `${minSize}%` : undefined,
        maxWidth: maxSize !== undefined ? `${maxSize}%` : undefined,
        ...style,
      }}
      data-panel
      data-default-size={defaultSize}
      data-min-size={minSize}
      data-max-size={maxSize}
    >
      {children}
    </div>
  )
}
ResizablePanel.displayName = "ResizablePanel"

// ─── ResizableHandle ──────────────────────────────────────────────────────────

interface ResizableHandleProps {
  withHandle?: boolean
  orientation?: Orientation
  className?: string
}

function ResizableHandle({
  withHandle = false,
  orientation = "horizontal",
  className,
}: ResizableHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const isCol = orientation === "horizontal" // vertical bar between left/right panels

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const handle = handleRef.current
      if (!handle) return

      const parent = handle.parentElement
      if (!parent) return

      // Find the panels on either side of the handle
      const siblings = Array.from(parent.children)
      const handleIndex = siblings.indexOf(handle)
      const prevPanel = siblings[handleIndex - 1] as HTMLElement | null
      const nextPanel = siblings[handleIndex + 1] as HTMLElement | null
      if (!prevPanel || !nextPanel) return

      // Read constraints from data attributes
      const prevMin = parseFloat(prevPanel.dataset.minSize || "0")
      const prevMax = parseFloat(prevPanel.dataset.maxSize || "100")
      const nextMin = parseFloat(nextPanel.dataset.minSize || "0")
      const nextMax = parseFloat(nextPanel.dataset.maxSize || "100")

      // Get the total space available (parent size minus all handle widths)
      const parentRect = parent.getBoundingClientRect()
      const totalSize = isCol ? parentRect.width : parentRect.height

      // Handle widths/heights (sum of all separator elements)
      let handlesTotalSize = 0
      siblings.forEach((s) => {
        if ((s as HTMLElement).dataset.separator !== undefined) {
          const r = s.getBoundingClientRect()
          handlesTotalSize += isCol ? r.width : r.height
        }
      })
      const availableSize = totalSize - handlesTotalSize

      // Starting sizes as percentages
      const prevRect = prevPanel.getBoundingClientRect()
      const nextRect = nextPanel.getBoundingClientRect()
      const startPrevPct = ((isCol ? prevRect.width : prevRect.height) / availableSize) * 100
      const startNextPct = ((isCol ? nextRect.width : nextRect.height) / availableSize) * 100

      const startPos = isCol ? e.clientX : e.clientY

      // Add dragging class to body
      document.body.style.cursor = isCol ? "col-resize" : "row-resize"
      document.body.style.userSelect = "none"
      handle.setAttribute("data-dragging", "true")

      const onPointerMove = (moveEvent: PointerEvent) => {
        const currentPos = isCol ? moveEvent.clientX : moveEvent.clientY
        const delta = currentPos - startPos
        const deltaPct = (delta / availableSize) * 100

        let newPrevPct = startPrevPct + deltaPct
        let newNextPct = startNextPct - deltaPct

        // Clamp to min/max
        if (newPrevPct < prevMin) {
          newPrevPct = prevMin
          newNextPct = startPrevPct + startNextPct - prevMin
        }
        if (newPrevPct > prevMax) {
          newPrevPct = prevMax
          newNextPct = startPrevPct + startNextPct - prevMax
        }
        if (newNextPct < nextMin) {
          newNextPct = nextMin
          newPrevPct = startPrevPct + startNextPct - nextMin
        }
        if (newNextPct > nextMax) {
          newNextPct = nextMax
          newPrevPct = startPrevPct + startNextPct - nextMax
        }

        prevPanel.style.flexBasis = `${newPrevPct}%`
        nextPanel.style.flexBasis = `${newNextPct}%`
      }

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove)
        document.removeEventListener("pointerup", onPointerUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        handle.removeAttribute("data-dragging")
      }

      document.addEventListener("pointermove", onPointerMove)
      document.addEventListener("pointerup", onPointerUp)
    },
    [isCol]
  )

  return (
    <div
      ref={handleRef}
      data-separator=""
      onPointerDown={onPointerDown}
      className={cn(
        "relative shrink-0 flex items-center justify-center",
        "select-none outline-none focus-visible:outline-none",
        "group/handle transition-colors",
        isCol
          ? "w-3 min-w-[12px] cursor-col-resize"
          : "h-3 min-h-[12px] cursor-row-resize",
        className
      )}
    >
      {/* Visual separator line */}
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

      {/* Grip pill */}
      {withHandle && (
        <div
          className={cn(
            "z-10 relative flex items-center justify-center rounded-sm",
            "bg-white dark:bg-slate-800",
            "border border-slate-200 dark:border-slate-600 shadow-sm",
            "opacity-40 group-hover/handle:opacity-100 transition-opacity duration-150",
            isCol ? "h-8 w-[14px]" : "h-[14px] w-8"
          )}
        >
          {isCol ? (
            <GripVertical className="h-3 w-3 text-slate-400 dark:text-slate-500" />
          ) : (
            <GripHorizontal className="h-3 w-3 text-slate-400 dark:text-slate-500" />
          )}
        </div>
      )}
    </div>
  )
}
ResizableHandle.displayName = "ResizableHandle"

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
