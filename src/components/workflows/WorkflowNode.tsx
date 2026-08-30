'use client'
import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, ShieldCheck, XCircle } from 'lucide-react'
import { getWorkflowNodeSpec, summarizeNode } from '@/lib/workflows/nodeRegistry'
import type { WorkflowNode as WorkflowNodeModel } from '@/lib/workflows/types'

export type WorkflowNodeData = {
  node: WorkflowNodeModel
  validationCount?: number
  executionStatus?: string
}
export type WorkflowFlowNode = Node<WorkflowNodeData, 'workflow'>

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  waiting: 'Waiting',
  waiting_approval: 'Waiting for approval',
  skipped: 'Skipped',
  interrupted: 'Interrupted',
  cancelled: 'Cancelled',
}

const categoryColorStyles: Record<string, { bg: string; text: string; ring: string }> = {
  sky: { bg: 'bg-sky-500/10 dark:bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-500/20' },
  blue: { bg: 'bg-blue-500/10 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/20' },
  cyan: { bg: 'bg-cyan-500/10 dark:bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/20' },
  amber: { bg: 'bg-amber-500/10 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/20' },
  violet: { bg: 'bg-violet-500/10 dark:bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/20' },
  orange: { bg: 'bg-orange-500/10 dark:bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/20' },
  purple: { bg: 'bg-purple-500/10 dark:bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400', ring: 'ring-purple-500/20' },
  teal: { bg: 'bg-teal-500/10 dark:bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-500/20' },
  rose: { bg: 'bg-rose-500/10 dark:bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/20' },
  indigo: { bg: 'bg-indigo-500/10 dark:bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500/20' },
}

export const WorkflowNode = memo(function WorkflowNode({ data, selected, isConnectable }: NodeProps<WorkflowFlowNode>) {
  const { node, validationCount = 0, executionStatus } = data
  const spec = getWorkflowNodeSpec(node.type)
  const Icon = spec.icon
  const colorTheme = categoryColorStyles[spec.color] ?? categoryColorStyles.blue

  const isRunning = executionStatus === 'running'
  const isSucceeded = executionStatus === 'succeeded'
  const isFailed = executionStatus === 'failed'
  const isWaitingApproval = executionStatus === 'waiting_approval'

  return (
    <div
      className={`workflow-node group relative min-w-56 rounded-xl border bg-card/95 text-card-foreground backdrop-blur-md transition-all duration-150 select-none ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/25 shadow-lg shadow-blue-500/10'
          : 'border-border/70 hover:border-border shadow-sm hover:shadow-md'
      } ${isRunning ? 'workflow-running-node border-blue-400' : ''}`}
      aria-label={`${spec.label} node: ${node.name}`}
    >
      {/* Target input ports */}
      {spec.inputs.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-background hover:!scale-125 transition-transform"
          aria-label={`${port.label} input to ${node.name}`}
        />
      ))}

      {/* Card Content Header */}
      <div className="flex items-start gap-3 p-3.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorTheme.bg} ${colorTheme.text} ring-1 ${colorTheme.ring}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {spec.label}
            </span>
            {executionStatus && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none ${
                  isSucceeded
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : isFailed
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : isRunning
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : isWaitingApproval
                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                    : 'bg-muted text-muted-foreground'
                }`}
                data-status={executionStatus}
              >
                {isRunning && <LoaderCircle className="h-2.5 w-2.5 animate-spin" />}
                {isSucceeded && <CheckCircle2 className="h-2.5 w-2.5" />}
                {isFailed && <XCircle className="h-2.5 w-2.5" />}
                {isWaitingApproval && <ShieldCheck className="h-2.5 w-2.5" />}
                {executionStatus === 'waiting' && <Clock className="h-2.5 w-2.5" />}
                {statusLabel[executionStatus] ?? executionStatus}
              </span>
            )}
          </div>
          <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
            {node.name}
          </span>
          <span className="mt-0.5 block max-w-44 truncate text-[11px] text-muted-foreground">
            {summarizeNode(node)}
          </span>
        </div>
      </div>

      {/* Validation issue footer */}
      {validationCount > 0 && (
        <div className="flex items-center gap-2 border-t border-border/50 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>
            {validationCount} issue{validationCount === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Source output ports */}
      {spec.outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          style={{ top: `${((index + 1) / (spec.outputs.length + 1)) * 100}%` }}
          className="!w-2.5 !h-2.5 !bg-blue-500 !border-2 !border-background hover:!scale-125 transition-transform"
          aria-label={`${port.label} output from ${node.name}`}
        />
      ))}
    </div>
  )
})
