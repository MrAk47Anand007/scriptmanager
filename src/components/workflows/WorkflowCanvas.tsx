'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  addEdge, applyEdgeChanges, applyNodeChanges, useReactFlow, type Connection, type Edge, type EdgeChange, type NodeChange, type OnReconnect,
} from '@xyflow/react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { selectActiveWorkflow, selectSelectedExecution, selectWorkflowSelection, selectWorkflowValidation, selectWorkflowViewport } from '@/features/workflows/selectors'
import { addNode, connectNodes, moveNodes, removeEdges, removeNodes, replaceConnection, selectNodes, setViewport } from '@/features/workflows/workflowsSlice'
import { getWorkflowNodeSpec } from '@/lib/workflows/nodeRegistry'
import { WorkflowNode, type WorkflowFlowNode } from './WorkflowNode'
import { WorkflowNodeLauncher } from './WorkflowNodeLauncher'

const nodeTypes = { workflow: WorkflowNode }

function CanvasInner() {
  const dispatch = useAppDispatch()
  const workflow = useAppSelector(selectActiveWorkflow)
  const selectedIds = useAppSelector(selectWorkflowSelection)
  const validation = useAppSelector(selectWorkflowValidation)
  const viewport = useAppSelector(selectWorkflowViewport)
  const execution = useAppSelector(selectSelectedExecution)
  const { fitView } = useReactFlow()
  const [launcher, setLauncher] = useState<{ open: boolean; x: number; y: number; connection?: Connection }>({ open: false, x: 80, y: 80 })

  const nodes = useMemo<WorkflowFlowNode[]>(() => workflow?.definition.nodes.map((node) => ({
    id: node.id, type: 'workflow', position: workflow.definition.editor?.positions[node.id] ?? { x: 0, y: 0 }, selected: selectedIds.includes(node.id),
    data: { node, validationCount: validation.filter((issue) => issue.path?.startsWith(`nodes[${workflow.definition.nodes.indexOf(node)}]`)).length, executionStatus: execution?.nodeRuns.find((run)=>run.nodeId===node.id)?.status },
  })) ?? [], [execution, selectedIds, validation, workflow])
  const edges = useMemo<Edge[]>(() => workflow?.definition.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourcePort, type: 'smoothstep', animated: false })) ?? [], [workflow])

  useEffect(() => {
    if (nodes.length !== 1) return
    const frame = requestAnimationFrame(() => void fitView({ maxZoom: 1, padding: 0.2 }))
    return () => cancelAnimationFrame(frame)
  }, [fitView, nodes.length])

  const onNodesChange = useCallback((changes: NodeChange<WorkflowFlowNode>[]) => {
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (removed.length) dispatch(removeNodes(removed))
    const positions = changes.filter((change): change is Extract<NodeChange<WorkflowFlowNode>, { type: 'position' }> => change.type === 'position' && change.dragging === false && Boolean(change.position)).map((change) => ({ id: change.id, position: change.position! }))
    if (positions.length) dispatch(moveNodes(positions))
    const selected = applyNodeChanges(changes, nodes).filter((node) => node.selected).map((node) => node.id)
    if (changes.some((change) => change.type === 'select')) dispatch(selectNodes(selected))
  }, [dispatch, nodes])
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (removed.length) dispatch(removeEdges(removed))
    applyEdgeChanges(changes, edges)
  }, [dispatch, edges])
  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    dispatch(connectNodes({ source: connection.source, target: connection.target, sourcePort: connection.sourceHandle === 'true' || connection.sourceHandle === 'false' ? connection.sourceHandle : undefined }))
    addEdge(connection, edges)
  }, [dispatch, edges])
  const reconnect: OnReconnect<Edge> = useCallback((oldEdge, connection) => {
    if (!connection.source || !connection.target) return
    dispatch(replaceConnection({ edgeId: oldEdge.id, source: connection.source, target: connection.target, sourcePort: connection.sourceHandle === 'true' || connection.sourceHandle === 'false' ? connection.sourceHandle : undefined }))
  }, [dispatch])

  if (!workflow) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select or create a workflow</div>
  return <div className="relative min-h-0 flex-1 bg-background" onDoubleClick={(event)=>{if(event.target===event.currentTarget)setLauncher({open:true,x:event.clientX,y:event.clientY})}}>
    <button aria-label="Add node" onClick={()=>setLauncher({ open: true, x: 80, y: 80 })} className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-md border border-wb-border bg-background px-2.5 py-1.5 text-xs shadow-sm hover:bg-muted"><Plus className="h-3.5 w-3.5"/>Add node</button>
    {workflow.definition.nodes.length===0&&<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><div className="pointer-events-auto max-w-xs text-center"><div className="text-sm font-semibold">Start your workflow</div><p className="mt-1 text-xs text-muted-foreground">Add the first step, then drag from its output to keep building.</p><button aria-label="Add first node" onClick={()=>setLauncher({open:true,x:120,y:120})} className="mt-4 rounded-md bg-accent-brand px-3 py-2 text-xs text-white">Add first node</button></div></div>}
    <WorkflowNodeLauncher open={launcher.open} origin={{ x: launcher.x, y: launcher.y }} onClose={()=>setLauncher((value)=>({...value,open:false}))} onSelect={(spec, position)=>{const action=addNode({ type: spec.type, name: spec.label, config: spec.defaults, position });dispatch(action);if(launcher.connection?.source)dispatch(connectNodes({source:launcher.connection.source,target:action.payload.id,sourcePort:launcher.connection.sourceHandle as 'true'|'false'|undefined}))}}/>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onReconnect={reconnect} onNodeDoubleClick={(_,node)=>dispatch(selectNodes([node.id]))} onViewportChange={(next)=>dispatch(setViewport(next))} defaultViewport={viewport} fitView fitViewOptions={{maxZoom:1}} minZoom={0.2} maxZoom={2} deleteKeyCode={['Backspace','Delete']} multiSelectionKeyCode={['Control','Meta']} selectionKeyCode="Shift">
      <Background variant={BackgroundVariant.Dots} gap={24} size={1}/><Controls showInteractive={false}/><MiniMap pannable zoomable aria-label="Workflow minimap" style={{ width: 112, height: 72 }}/>
    </ReactFlow>
  </div>
}

export function WorkflowCanvas() { return <ReactFlowProvider><CanvasInner/></ReactFlowProvider> }
