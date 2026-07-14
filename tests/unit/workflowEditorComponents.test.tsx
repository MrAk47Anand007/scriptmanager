// @vitest-environment jsdom
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { ReactFlowProvider } from '@xyflow/react'
import { makeStore } from '@/store/store'
import { moveNodes, selectNode, selectWorkflow, setValidation } from '@/features/workflows/workflowsSlice'
import { WorkflowNodeLauncher } from '@/components/workflows/WorkflowNodeLauncher'
import { WorkflowNode } from '@/components/workflows/WorkflowNode'
import { WorkflowCanvas } from '@/components/workflows/WorkflowCanvas'
import { WorkflowInspector } from '@/components/workflows/WorkflowInspector'
import { WorkflowValidationPanel } from '@/components/workflows/WorkflowValidationPanel'
import { WorkflowCommandBar } from '@/components/workflows/WorkflowCommandBar'

beforeAll(() => {
  class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 900 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 })
})

afterEach(cleanup)

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
})
