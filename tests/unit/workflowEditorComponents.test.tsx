// @vitest-environment jsdom
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { ReactFlowProvider } from '@xyflow/react'
import { makeStore } from '@/store/store'
import { moveNodes, selectNode, selectWorkflow, setExecutionDetail, setSelectedExecution, setValidation, setWorkflowRuns } from '@/features/workflows/workflowsSlice'
import { WorkflowNodeLauncher } from '@/components/workflows/WorkflowNodeLauncher'
import { WorkflowNode } from '@/components/workflows/WorkflowNode'
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas'
import { WorkflowInspector } from '@/components/workflows/WorkflowInspector'
import { WorkflowValidationPanel } from '@/components/workflows/WorkflowValidationPanel'
import { WorkflowCommandBar } from '@/components/workflows/WorkflowCommandBar'
import { WorkflowExecutionDrawer } from '@/components/workflows/WorkflowExecutionDrawer'
import { WorkflowEditorShell } from '@/components/workflows/WorkflowEditorShell'
import { WorkflowSidebar } from '@/components/workflows/WorkflowSidebar'
import { toast } from '@/components/ui/toast'

beforeAll(() => {
  class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
})

afterEach(() => {
  cleanup()
  delete window.scriptManagerDesktop
  vi.restoreAllMocks()
})

describe('workflow editor components', () => {
  it('searches the node launcher and supports keyboard selection', () => {
    const onSelect = vi.fn()
    render(<WorkflowNodeLauncher open origin={{ x: 80, y: 120 }} onSelect={onSelect} onClose={() => undefined} />)
    const search = screen.getByRole('combobox', { name: 'Search workflow nodes' })
    fireEvent.change(search, { target: { value: 'approval' } })
    expect(screen.getByRole('option', { name: /Approval/ })).toBeTruthy()
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ type: 'approval' }), { x: 80, y: 120 })
  })

  it('renders accessible node handles, summary, validation, and execution text', () => {
    render(<ReactFlowProvider><WorkflowNode id="condition" selected data={{
      node: { id: 'condition', type: 'condition', name: 'Check release', config: { left: '$build.ok', operator: 'truthy' } },
      validationCount: 1,
      executionStatus: 'running',
    }} type="workflow" dragging={false} draggable selectable deletable zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} /></ReactFlowProvider>)
    expect(screen.getByText('Check release')).toBeTruthy()
    expect(screen.getByText(/build.ok/)).toBeTruthy()
    expect(screen.getByText('1 issue')).toBeTruthy()
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByLabelText('True output from Check release')).toBeTruthy()
    expect(screen.getByLabelText('False output from Check release')).toBeTruthy()
  })

  it('renders an interactive canvas with named viewport controls', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1000 } }], edges: [],
    } }))
    render(<Provider store={store}><WorkflowCanvas /></Provider>)
    expect(screen.getByRole('button', { name: 'Add node' })).toBeTruthy()
    expect(screen.getByTitle('Zoom In')).toBeTruthy()
    expect(screen.getByTitle('Fit View')).toBeTruthy()
    expect(screen.getByText('Wait')).toBeTruthy()
  })

  it('edits typed node fields and keeps invalid advanced JSON out of Redux', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1000 } }], edges: [],
    } }))
    store.dispatch(selectNode('wait'))
    render(<Provider store={store}><WorkflowInspector /></Provider>)
    fireEvent.change(screen.getByLabelText('Duration (ms)'), { target: { value: '2500' } })
    expect(store.getState().workflows.active!.definition.nodes[0].config.durationMs).toBe(2500)
    fireEvent.click(screen.getByRole('button', { name: 'Advanced JSON' }))
    fireEvent.change(screen.getByLabelText('Configuration JSON'), { target: { value: '{bad' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter valid JSON')
    expect(store.getState().workflows.active!.definition.nodes[0].config).toEqual({ durationMs: 2500 })
  })

  it('navigates validation issues to their nodes', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 0 } }], edges: [],
    } }))
    store.dispatch(setValidation([{ code: 'invalid_config', message: 'Duration must be positive', path: 'nodes[0].config.durationMs' }]))
    render(<Provider store={store}><WorkflowValidationPanel /></Provider>)
    fireEvent.click(screen.getByRole('button', { name: /Duration must be positive/ }))
    expect(store.getState().workflows.selectedNodeId).toBe('wait')
  })

  it('shows lifecycle state and blocks publish or run when unavailable', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1000 } }], edges: [],
    } }))
    store.dispatch(moveNodes([{ id: 'wait', position: { x: 20, y: 20 } }]))
    store.dispatch(setValidation([{ code: 'invalid_config', message: 'Fix node', path: 'nodes[0]' }]))
    render(<Provider store={store}><WorkflowCommandBar /></Provider>)
    expect(screen.getByText((_, element) => element?.textContent?.startsWith('Unsaved changes ·') === true)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run workflow' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('reports workflow save failures without clearing unsaved changes', async () => {
    const saveWorkflow = vi.fn().mockRejectedValue(new Error('Workflow could not be saved'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { saveWorkflow } } as never
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: null, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'wait', type: 'delay', name: 'Wait', config: { durationMs: 1000 } }], edges: [],
    } }))
    store.dispatch(moveNodes([{ id: 'wait', position: { x: 20, y: 20 } }]))
    render(<Provider store={store}><WorkflowCommandBar /></Provider>)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Workflow could not be saved'))
    expect(saveWorkflow).toHaveBeenCalledOnce()
    expect(store.getState().workflows.dirty).toBe(true)
  })

  it('inspects historical run and selected node details without changing the draft', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: 1, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'build', type: 'script', name: 'Build', config: { scriptId: 'release' } }], edges: [],
    } }))
    store.dispatch(setWorkflowRuns([{ id: 'run-1', status: 'failed', createdAt: '2026-07-15T00:00:00.000Z' }]))
    store.dispatch(setExecutionDetail({ id: 'run-1', status: 'failed', createdAt: '2026-07-15T00:00:00.000Z', nodeRuns: [{ nodeId: 'build', status: 'failed', attempt: 2, input: { branch: 'main' }, error: { message: 'Build failed' } }] }))
    store.dispatch(setSelectedExecution('run-1'))
    store.dispatch(selectNode('build'))
    const original = JSON.stringify(store.getState().workflows.active!.definition)
    render(<Provider store={store}><WorkflowExecutionDrawer /></Provider>)
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.getByText((_, element) => element?.textContent === 'Attempt 2')).toBeTruthy()
    expect(screen.getByText('Build failed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry Build' })).toBeEnabled()
    expect(JSON.stringify(store.getState().workflows.active!.definition)).toBe(original)
  })

  it('reports workflow node retry failures', async () => {
    const retryWorkflowNode = vi.fn().mockRejectedValue(new Error('Retry could not be started'))
    const errorToast = vi.spyOn(toast, 'error')
    window.scriptManagerDesktop = { runtime: { retryWorkflowNode } } as never
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Flow', publishedVersion: 1, definition: {
      schemaVersion: 1, name: 'Flow', nodes: [{ id: 'build', type: 'script', name: 'Build', config: { scriptId: 'release' } }], edges: [],
    } }))
    store.dispatch(setExecutionDetail({ id: 'run-1', status: 'failed', createdAt: '2026-07-15T00:00:00.000Z', nodeRuns: [{ nodeId: 'build', status: 'failed', attempt: 1, error: { message: 'Build failed' } }] }))
    store.dispatch(setSelectedExecution('run-1'))
    store.dispatch(selectNode('build'))
    render(<Provider store={store}><WorkflowExecutionDrawer /></Provider>)

    fireEvent.click(screen.getByRole('button', { name: 'Retry Build' }))

    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Retry could not be started'))
    expect(retryWorkflowNode).toHaveBeenCalledWith({ runId: 'run-1', nodeId: 'build' })
  })

  it('composes named responsive regions and an actionable empty workflow state', () => {
    const store = makeStore()
    store.dispatch(selectWorkflow({ id: 'w', name: 'Empty flow', publishedVersion: null, definition: { schemaVersion: 1, name: 'Empty flow', nodes: [], edges: [] } }))
    render(<Provider store={store}><WorkflowEditorShell /></Provider>)
    expect(screen.getByRole('main', { name: 'Workflow canvas' })).toBeTruthy()
    expect(screen.getByLabelText('Node inspector')).toBeTruthy()
    expect(screen.getByLabelText('Workflow executions')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add first node' })).toBeTruthy()
  })

  it('collapses and restores workflow navigation', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => [] }))
    const store = makeStore()
    render(<Provider store={store}><WorkflowSidebar /></Provider>)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse workflows' }))
    expect(screen.queryByText('Start from template')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand workflows' }))
    expect(screen.getByText('Start from template')).toBeTruthy()
  })
})
