'use client'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { getWorkflowNodeSpec, summarizeNode } from '@/lib/workflows/nodeRegistry'
import type { WorkflowNode as WorkflowNodeModel } from '@/lib/workflows/types'

export type WorkflowNodeData = {
  node: WorkflowNodeModel
  validationCount?: number
  executionStatus?: string
}
export type WorkflowFlowNode = Node<WorkflowNodeData, 'workflow'>

const statusLabel: Record<string, string> = { pending: 'Pending', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', waiting: 'Waiting', waiting_approval: 'Waiting for approval', skipped: 'Skipped', interrupted: 'Interrupted', cancelled: 'Cancelled' }

export function WorkflowNode({ data, selected, isConnectable }: NodeProps<WorkflowFlowNode>) {
  const { node, validationCount = 0, executionStatus } = data
  const spec = getWorkflowNodeSpec(node.type)
  const Icon = spec.icon
  return <div className={`workflow-node min-w-52 rounded-lg border bg-background shadow-sm ${selected?'border-accent-brand shadow-md':'border-wb-border'} ${executionStatus==='running'?'workflow-running-node':''}`} aria-label={`${spec.label} node: ${node.name}`}>
    {spec.inputs.map((port)=><Handle key={port.id} id={port.id} type="target" position={Position.Left} isConnectable={isConnectable} aria-label={`${port.label} input to ${node.name}`}/>) }
    <div className="flex items-start gap-3 px-3 py-3"><span className="rounded-md bg-accent-brand/10 p-1.5 text-accent-brand"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{spec.label}</span><span className="mt-0.5 block truncate text-sm font-semibold">{node.name}</span><span className="mt-1 block max-w-44 truncate text-[10px] text-muted-foreground">{summarizeNode(node)}</span></span></div>
    {(validationCount>0||executionStatus)&&<div className="flex items-center gap-2 border-t border-wb-border px-3 py-1.5 text-[10px]">{validationCount>0&&<span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3 w-3"/>{validationCount} issue{validationCount===1?'':'s'}</span>}{executionStatus&&<span className="ml-auto flex items-center gap-1" data-status={executionStatus}>{executionStatus==='running'&&<LoaderCircle className="h-3 w-3"/>}{statusLabel[executionStatus]??executionStatus}</span>}</div>}
    {spec.outputs.map((port, index)=><Handle key={port.id} id={port.id} type="source" position={Position.Right} isConnectable={isConnectable} style={{ top: `${((index+1)/(spec.outputs.length+1))*100}%` }} aria-label={`${port.label} output from ${node.name}`}/>) }
  </div>
}
