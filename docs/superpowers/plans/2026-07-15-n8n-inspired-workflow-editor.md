# n8n-Inspired Workflow Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ScriptManager's static workflow grid and JSON-only inspector with a compatible, accessible, n8n-inspired visual editor and integrated execution inspection.

**Architecture:** `@xyflow/react` owns viewport and pointer interactions at the canvas boundary while Redux remains authoritative for the workflow draft, history, validation, request state, and execution overlays. A registry defines every node's visual, connection, validation, and typed-inspector behavior; existing workflow runtime contracts remain unchanged and legacy definitions receive deterministic editor layout metadata.

**Tech Stack:** Next.js 15, React 19, TypeScript, Redux Toolkit, Tailwind CSS, `@xyflow/react`, Lucide React, Vitest, Testing Library, Prisma/SQLite APIs.

## Global Constraints

- Preserve existing node IDs, edges, configurations, published versions, runtime behavior, approval routing, ACP agents, plugin nodes, project bindings, and opaque secret references.
- Do not resolve or place secrets in Redux, canvas summaries, validation output, execution overlays, logs, or approval previews.
- Existing workflow definitions without editor metadata must open through deterministic automatic layout.
- Client validation supplements but never replaces authoritative server validation.
- Status and errors must not rely on color alone; all motion must respect `prefers-reduced-motion`.
- Optimize for Electron desktop, with collapsible sidebar, overlay inspector, and resizable execution drawer at narrow widths.
- Use TDD, make one behavior change per task, and commit after every independently passing task.

## File Map

- `src/lib/workflows/editorTypes.ts` — editor-only positions, viewport, validation, execution-overlay, and registry contracts.
- `src/lib/workflows/editorLayout.ts` — deterministic legacy graph layout and metadata normalization.
- `src/lib/workflows/nodeRegistry.tsx` — node catalog, icons, defaults, handles, summaries, inspector fields, and configuration validation.
- `src/features/workflows/workflowsSlice.ts` — canonical draft edits, selection, history, request states, viewport, validation, and execution selection.
- `src/features/workflows/selectors.ts` — focused selectors for editor components.
- `src/components/workflows/WorkflowBuilder.tsx` — compatibility wrapper delegating to the new editor shell.
- `src/components/workflows/WorkflowEditorShell.tsx` — responsive editor region composition.
- `src/components/workflows/WorkflowCommandBar.tsx` — save, validate, publish, run, history, and request feedback.
- `src/components/workflows/WorkflowCanvas.tsx` — React Flow adapter and graph interactions.
- `src/components/workflows/WorkflowNode.tsx` — registry-driven node renderer and statuses.
- `src/components/workflows/WorkflowNodeLauncher.tsx` — search, grouping, recent nodes, and placement.
- `src/components/workflows/WorkflowInspector.tsx` — typed fields and validated advanced JSON mode.
- `src/components/workflows/WorkflowValidationPanel.tsx` — navigable issues.
- `src/components/workflows/WorkflowExecutionDrawer.tsx` — run history and per-node execution detail.
- `src/components/workflows/WorkflowSidebar.tsx` — collapse support and polished workflow navigation.
- `src/components/workflows/WorkflowPalette.tsx` — removed after launcher adoption.
- `src/app/globals.css` — React Flow theme, focus, reduced-motion, and responsive editor rules.
- `package.json`, `package-lock.json` — `@xyflow/react` dependency.
- `tests/unit/workflowEditorLayout.test.ts` — legacy compatibility and deterministic layout.
- `tests/unit/workflowNodeRegistry.test.ts` — registry, defaults, summaries, handles, and validation.
- `tests/unit/workflowsSlice.test.ts` — graph mutations, history, lifecycle, and overlays.
- `tests/unit/workflowEditorComponents.test.tsx` — launcher, inspector, command bar, validation, and accessibility.
- `tests/integration/workflowEditorAcceptance.test.ts` — existing API lifecycle and execution detail contract.
- `docs/superpowers/handoffs/2026-07-13-session-handoff.md` — final branch truth and verification evidence.

---

### Task 1: Editor metadata and legacy compatibility

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/workflows/editorTypes.ts`
- Create: `src/lib/workflows/editorLayout.ts`
- Modify: `src/lib/workflows/types.ts`
- Test: `tests/unit/workflowEditorLayout.test.ts`

**Interfaces:**
- Produces: `WorkflowEditorMetadata`, `WorkflowNodePosition`, `normalizeEditorMetadata(definition)`, and `layoutWorkflowNodes(definition)`.
- Consumes: existing `WorkflowDefinition`, `WorkflowNode`, and `planWorkflow()`.

- [ ] **Step 1: Install the canvas dependency**

Run: `npm install @xyflow/react`

Expected: `package.json` and `package-lock.json` add one direct dependency and `npm ls @xyflow/react` exits 0.

- [ ] **Step 2: Write failing deterministic-layout tests**

Create `tests/unit/workflowEditorLayout.test.ts` with assertions equivalent to:

```ts
const definition = workflowWithoutEditorMetadata()
const first = normalizeEditorMetadata(definition)
const second = normalizeEditorMetadata(definition)
expect(first).toEqual(second)
expect(first.positions.start.x).toBeLessThan(first.positions.build.x)
expect(first.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
expect(normalizeEditorMetadata({ ...definition, editor: first })).toEqual(first)
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/workflowEditorLayout.test.ts`

Expected: FAIL because `editorLayout` and editor metadata types do not exist.

- [ ] **Step 4: Implement compatible editor metadata**

Add optional metadata without changing runtime semantics:

```ts
export type WorkflowEditorMetadata = {
  positions: Record<string, { x: number; y: number }>
  viewport: { x: number; y: number; zoom: number }
}

export function normalizeEditorMetadata(definition: WorkflowDefinition): WorkflowEditorMetadata {
  const generated = layoutWorkflowNodes(definition)
  return {
    positions: Object.fromEntries(definition.nodes.map((node) => [node.id, definition.editor?.positions[node.id] ?? generated[node.id]])),
    viewport: definition.editor?.viewport ?? { x: 0, y: 0, zoom: 1 },
  }
}
```

Use deterministic topological layers with fixed horizontal and vertical gaps; orphaned or invalid graphs fall back to stable index-based rows. Add `editor?: WorkflowEditorMetadata` to `WorkflowDefinition`; runtime planning continues to read only nodes and edges.

- [ ] **Step 5: Run compatibility tests and typecheck**

Run: `npx vitest run tests/unit/workflowEditorLayout.test.ts tests/unit/workflowGraph.test.ts tests/unit/workflowSchema.test.ts && npx tsc --noEmit`

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit the foundation**

```powershell
git add package.json package-lock.json src/lib/workflows/editorTypes.ts src/lib/workflows/editorLayout.ts src/lib/workflows/types.ts tests/unit/workflowEditorLayout.test.ts
git commit -m "feat(workflows): add compatible editor metadata"
```

### Task 2: Registry and typed node definitions

**Files:**
- Create: `src/lib/workflows/nodeRegistry.tsx`
- Test: `tests/unit/workflowNodeRegistry.test.ts`

**Interfaces:**
- Produces: `WorkflowNodeSpec`, `InspectorField`, `getWorkflowNodeSpec(type)`, `listWorkflowNodeSpecs()`, `validateNodeConfig(node)`, and `summarizeNode(node)`.
- Consumes: `WorkflowNode`, `WorkflowNodeType`, and plugin node type syntax `plugin:${string}:${string}`.

- [ ] **Step 1: Write failing registry contract tests**

Cover every built-in node, condition true/false handles, typed defaults, searchable categories, safe plugin fallback, and validation:

```ts
expect(getWorkflowNodeSpec('condition').outputs.map((port) => port.id)).toEqual(['true', 'false'])
expect(getWorkflowNodeSpec('script').fields).toContainEqual(expect.objectContaining({ key: 'scriptId', required: true }))
expect(getWorkflowNodeSpec('plugin:demo:lint').category).toBe('plugins')
expect(validateNodeConfig({ id: 'x', type: 'delay', name: 'Wait', config: { durationMs: 0 } })).toContainEqual(expect.objectContaining({ code: 'invalid_config' }))
```

- [ ] **Step 2: Verify registry tests fail**

Run: `npx vitest run tests/unit/workflowNodeRegistry.test.ts`

Expected: FAIL because `nodeRegistry` does not exist.

- [ ] **Step 3: Implement the single source-of-truth registry**

Define exact categories `triggers | actions | flow | agents | communication | plugins`, field kinds `text | textarea | number | select | resource | json`, connection ports, defaults, summaries, keywords, and validation for all existing built-ins. Use a safe generic spec for plugin nodes and unknown future values; never include config values whose key matches secret/token/password/credential patterns in summaries.

- [ ] **Step 4: Run registry and security regressions**

Run: `npx vitest run tests/unit/workflowNodeRegistry.test.ts tests/unit/secretReferences.test.ts tests/integration/secretRedaction.test.ts`

Expected: all tests pass; summaries contain no test secret values.

- [ ] **Step 5: Commit the registry**

```powershell
git add src/lib/workflows/nodeRegistry.tsx tests/unit/workflowNodeRegistry.test.ts
git commit -m "feat(workflows): define visual node registry"
```

### Task 3: Redux graph editing, history, and request lifecycle

**Files:**
- Modify: `src/features/workflows/workflowsSlice.ts`
- Modify: `src/features/workflows/selectors.ts`
- Test: `tests/unit/workflowsSlice.test.ts`

**Interfaces:**
- Produces actions `moveNodes`, `removeNodes`, `removeEdges`, `replaceConnection`, `duplicateSelection`, `undoWorkflowEdit`, `redoWorkflowEdit`, `setViewport`, `setSelectedExecution`, and lifecycle fields `saveStatus`, `publishStatus`, `runStatus`, `requestError`.
- Consumes: normalized editor metadata and node registry defaults.

- [ ] **Step 1: Extend reducer tests before implementation**

Add focused tests that initialize one workflow, move two selected nodes, undo and redo, reject self/duplicate edges, preserve condition `sourcePort`, duplicate a connected selection with fresh IDs, and retain dirty state after rejected save:

```ts
state = reducer(state, moveNodes([{ id: 'a', position: { x: 40, y: 80 } }]))
expect(state.active?.definition.editor?.positions.a).toEqual({ x: 40, y: 80 })
expect(reducer(state, undoWorkflowEdit()).active?.definition.editor?.positions.a).toEqual(originalPosition)
expect(reducer(saveRejectedState, saveWorkflow.rejected(new Error('offline'), '', undefined))).toMatchObject({ dirty: true, saveStatus: 'failed' })
```

- [ ] **Step 2: Verify slice tests fail**

Run: `npx vitest run tests/unit/workflowsSlice.test.ts`

Expected: FAIL on missing actions and state fields.

- [ ] **Step 3: Implement bounded history and graph reducers**

Store at most 50 canonical definition snapshots. Do not add selection, viewport-only changes, request statuses, runs, or resolved resource data to history. Normalize metadata on `selectWorkflow`; clear history when switching workflows; ensure every graph edit sets `dirty = true` and clears stale validation for affected nodes.

- [ ] **Step 4: Implement explicit async lifecycle reducers**

Set `saving/publishing/running`, clear the relevant previous error on pending, update the active item on success, and preserve actionable errors on rejection. Use a serializable `requestError: { operation; message } | null`.

- [ ] **Step 5: Run reducer and TypeScript checks**

Run: `npx vitest run tests/unit/workflowsSlice.test.ts && npx tsc --noEmit`

Expected: focused tests and typecheck pass.

- [ ] **Step 6: Commit editor state**

```powershell
git add src/features/workflows/workflowsSlice.ts src/features/workflows/selectors.ts tests/unit/workflowsSlice.test.ts
git commit -m "feat(workflows): add visual editor state and history"
```

### Task 4: Interactive canvas, node launcher, and accessible graph controls

**Files:**
- Create: `src/components/workflows/WorkflowNode.tsx`
- Create: `src/components/workflows/WorkflowNodeLauncher.tsx`
- Rewrite: `src/components/workflows/WorkflowCanvas.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/workflowEditorComponents.test.tsx`

**Interfaces:**
- Produces: `<WorkflowCanvas />`, `<WorkflowNode />`, and `<WorkflowNodeLauncher open origin onSelect onClose />`.
- Consumes: registry, graph Redux actions, normalized positions, and `@xyflow/react` adapters.

- [ ] **Step 1: Add browser-environment test setup and failing interaction tests**

Stub `ResizeObserver`, render a store-backed workflow canvas, and test launcher search/keyboard selection, add-from-edge, drag dispatch, delete, duplicate, connection ports, fit-view control labels, and node status text. Assert buttons and handles have accessible names.

- [ ] **Step 2: Verify component tests fail**

Run: `npx vitest run tests/unit/workflowEditorComponents.test.tsx`

Expected: FAIL because the new components and React Flow adapter are absent.

- [ ] **Step 3: Implement registry-driven nodes and launcher**

Render icon, type, name, summary, labeled handles, validation badge, and execution label. Launcher filters `listWorkflowNodeSpecs()` by label/category/keywords, supports arrow keys/Enter/Escape, groups results, and uses registry defaults when dispatching `addNode`.

- [ ] **Step 4: Replace the static grid with React Flow**

Adapt workflow nodes and edges at the component boundary. Wire `onNodesChange`, `onEdgesChange`, `onConnect`, `onReconnect`, selection, double-click quick-add, output-drop quick-add, controls, optional minimap, background, keyboard deletion, and fit-view. Persist final drag positions rather than every pointer frame.

- [ ] **Step 5: Add visual, focus, and reduced-motion CSS**

Import React Flow base styles once, then theme surfaces through existing CSS variables. Add visible focus rings, high-contrast fallbacks, status patterns/icons, and:

```css
@media (prefers-reduced-motion: reduce) {
  .workflow-running-node, .react-flow__edge-path { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 6: Run component, accessibility, and type checks**

Run: `npx vitest run tests/unit/workflowEditorComponents.test.tsx tests/unit/accessibilityRelease.test.ts && npx tsc --noEmit`

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit the interactive canvas**

```powershell
git add src/components/workflows/WorkflowNode.tsx src/components/workflows/WorkflowNodeLauncher.tsx src/components/workflows/WorkflowCanvas.tsx src/app/globals.css tests/unit/workflowEditorComponents.test.tsx
git commit -m "feat(workflows): build interactive workflow canvas"
```

### Task 5: Typed inspector, validation navigation, and command lifecycle

**Files:**
- Rewrite: `src/components/workflows/WorkflowInspector.tsx`
- Create: `src/components/workflows/WorkflowValidationPanel.tsx`
- Create: `src/components/workflows/WorkflowCommandBar.tsx`
- Modify: `src/components/workflows/WorkflowBuilder.tsx`
- Extend test: `tests/unit/workflowEditorComponents.test.tsx`

**Interfaces:**
- Produces: typed field editing, local advanced-JSON buffer, issue focus callbacks, and lifecycle actions.
- Consumes: node registry fields, `validateNodeConfig`, `validateWorkflowGraph`, Redux lifecycle state, and current APIs.

- [ ] **Step 1: Write failing inspector and lifecycle tests**

Test script/resource fields, condition operators, delay numeric validation, advanced JSON parse errors that do not mutate Redux, issue-click node focus, dirty/saving/failed labels, publish blocked by issues, and Run disabled without a published version.

- [ ] **Step 2: Verify the new tests fail**

Run: `npx vitest run tests/unit/workflowEditorComponents.test.tsx`

Expected: FAIL on missing typed fields, issue navigation, and lifecycle labels.

- [ ] **Step 3: Implement typed inspector fields**

Render controls from `WorkflowNodeSpec.fields`. Keep advanced JSON in component-local text; dispatch only after `JSON.parse` succeeds and `validateNodeConfig` returns no blocking errors. Resource fields use existing list endpoints and store IDs or opaque references only.

- [ ] **Step 4: Implement continuous validation and issue navigation**

Combine `validateWorkflowGraph(definition)` with registry validation after draft changes using a short debounced effect. Map `nodes[index]` paths to node IDs. Clicking an issue selects and centers the node; graph-level issues fit the graph.

- [ ] **Step 5: Implement the command bar and compatibility wrapper**

Replace the current header with Save, Validate, Publish, Run, undo, redo, dirty/saved status, and inline request recovery. Keep `WorkflowBuilder` as the dynamic-imported public component and have it compose the new shell in Task 7.

- [ ] **Step 6: Run focused and existing workflow tests**

Run: `npx vitest run tests/unit/workflowEditorComponents.test.tsx tests/unit/workflowGraph.test.ts tests/unit/workflowSchema.test.ts tests/integration/workflowRoutes.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit configuration and lifecycle UX**

```powershell
git add src/components/workflows/WorkflowInspector.tsx src/components/workflows/WorkflowValidationPanel.tsx src/components/workflows/WorkflowCommandBar.tsx src/components/workflows/WorkflowBuilder.tsx tests/unit/workflowEditorComponents.test.tsx
git commit -m "feat(workflows): add typed configuration and validation UX"
```

### Task 6: Execution drawer and canvas execution overlays

**Files:**
- Create: `src/components/workflows/WorkflowExecutionDrawer.tsx`
- Modify: `src/components/workflows/WorkflowNode.tsx`
- Modify: `src/features/workflows/workflowsSlice.ts`
- Modify: `src/features/workflows/selectors.ts`
- Create: `tests/integration/workflowEditorAcceptance.test.ts`
- Extend test: `tests/unit/workflowEditorComponents.test.tsx`

**Interfaces:**
- Produces: `fetchWorkflowRuns(workflowId)`, `fetchWorkflowRun(runId)`, execution selectors, run overlay, node detail, retry, cancel, and Approval Inbox deep link.
- Consumes: `/api/workflows/[id]/runs`, `/api/workflow-runs/[id]`, `/cancel`, `/retry-node`, and existing redacted persisted run data.

- [ ] **Step 1: Write failing execution acceptance tests**

Seed a workflow and persisted run, call the existing route handlers, and assert the editor contract includes run status, node statuses, redacted output/error, attempt, timing, and approval/agent waiting state without secret plaintext.

- [ ] **Step 2: Run acceptance test and confirm the contract gap**

Run: `npx vitest run tests/integration/workflowEditorAcceptance.test.ts`

Expected: FAIL only for fields not currently selected or normalized for the editor.

- [ ] **Step 3: Add the smallest required API normalization**

Prefer adapting existing route responses client-side. If a required persisted field is absent, extend the existing repository/route select without creating a parallel execution API. Pass all values through existing redaction behavior.

- [ ] **Step 4: Implement execution thunks, drawer, and overlays**

Fetch recent runs after workflow selection and after Run succeeds. Selecting a run fetches detail, maps node status by node ID, and renders pending/running/succeeded/failed/waiting/waiting-approval/skipped/interrupted/cancelled labels. Drawer tabs show Runs, Input/Output, Logs, and Errors; unavailable fields show an explicit empty state.

- [ ] **Step 5: Wire retry, cancel, approval, and agent guidance**

Expose retry only for failed workflow nodes, cancel only for cancellable runs, Approval Inbox navigation only for waiting approval nodes, and desktop guidance for agent nodes whose output reports `desktopHostRequired`.

- [ ] **Step 6: Verify execution and redaction behavior**

Run: `npx vitest run tests/integration/workflowEditorAcceptance.test.ts tests/integration/workflowRoutes.test.ts tests/integration/secretRedaction.test.ts tests/unit/workflowEditorComponents.test.tsx`

Expected: all tests pass and no fixture secret appears in serialized output.

- [ ] **Step 7: Commit execution inspection**

```powershell
git add src/components/workflows/WorkflowExecutionDrawer.tsx src/components/workflows/WorkflowNode.tsx src/features/workflows/workflowsSlice.ts src/features/workflows/selectors.ts tests/integration/workflowEditorAcceptance.test.ts tests/unit/workflowEditorComponents.test.tsx
git commit -m "feat(workflows): integrate visual execution inspection"
```

### Task 7: Responsive shell, sidebar polish, removal, and release verification

**Files:**
- Create: `src/components/workflows/WorkflowEditorShell.tsx`
- Modify: `src/components/workflows/WorkflowBuilder.tsx`
- Modify: `src/components/workflows/WorkflowSidebar.tsx`
- Delete: `src/components/workflows/WorkflowPalette.tsx`
- Modify: `src/app/globals.css`
- Modify: `docs/superpowers/handoffs/2026-07-13-session-handoff.md`
- Extend test: `tests/unit/workflowEditorComponents.test.tsx`

**Interfaces:**
- Produces: final responsive editor composition and verified handoff.
- Consumes: command bar, canvas, launcher, inspector, validation panel, and execution drawer from Tasks 4-6.

- [ ] **Step 1: Add failing shell accessibility and responsive-state tests**

Test named regions, sidebar collapse, inspector overlay toggle, drawer collapse/resize affordance, focus return after closing overlays, empty workflow trigger prompt, and narrow-width class behavior.

- [ ] **Step 2: Verify shell tests fail**

Run: `npx vitest run tests/unit/workflowEditorComponents.test.tsx`

Expected: FAIL because the shell and responsive controls do not exist.

- [ ] **Step 3: Compose the editor shell and polish the Workflow sidebar**

Use CSS grid/flex regions with canvas as the only expanding region. Collapse sidebar through an explicit button, render inspector as a dialog-like overlay below the narrow breakpoint, and use the existing resizable primitives for the execution drawer. Empty workflows show `Add a trigger` plus relevant templates.

- [ ] **Step 4: Remove the obsolete palette and dead imports**

Delete `WorkflowPalette.tsx`, remove all imports, and verify `rg -n "WorkflowPalette" src tests` returns no matches.

- [ ] **Step 5: Run the complete automated gate**

Run in PowerShell with the repository's verified test database/environment values:

```powershell
$env:DATABASE_URL='file:./phase2-baseline.db'
$env:AUTH_SECRET='workflow-editor-verification-secret'
$env:SESSION_SECRET='workflow-editor-session-secret'
npm test
npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
npm run build
git diff --check
```

Expected: Vitest, both TypeScript checks, Next.js production build, and diff hygiene all pass. Record exact test-file/test counts and any pre-existing warning.

- [ ] **Step 6: Perform manual Electron visual QA**

Run: `npm run electron:dev`

Verify wide and narrow windows, pointer and trackpad canvas behavior, keyboard-only create/connect/edit/delete/undo/redo, dense and branching graphs, long node names, execution drawer resizing, inspector overlay, focus return, dark/light theme, reduced motion, and save/publish/run failure feedback. Record any environment blocker separately from code completion.

- [ ] **Step 7: Update the session handoff**

Update the handoff with active branch/worktree truth, commit chain, exact automated evidence, manual QA result, dependency addition, compatibility behavior, unresolved caveats, and the ordered next actions. Do not preserve stale Phase 10 worktree claims as current truth.

- [ ] **Step 8: Commit final integration and handoff**

```powershell
git add src/components/workflows/WorkflowEditorShell.tsx src/components/workflows/WorkflowBuilder.tsx src/components/workflows/WorkflowSidebar.tsx src/app/globals.css tests/unit/workflowEditorComponents.test.tsx docs/superpowers/handoffs/2026-07-13-session-handoff.md
git add -u src/components/workflows/WorkflowPalette.tsx
git commit -m "feat(workflows): complete n8n-inspired editor redesign"
```

## Completion Gate

- [ ] Existing workflow definitions load deterministically without data migration.
- [ ] Drag, pan, zoom, select, multi-select, connect, reconnect, copy/paste, duplicate, delete, undo, and redo work.
- [ ] All built-in and plugin workflow nodes are discoverable through the registry-driven launcher.
- [ ] Typed inspectors cover every built-in node; advanced JSON cannot commit invalid data.
- [ ] Validation is continuous, node-addressable, and publish-blocking where required.
- [ ] Save, publish, and run failures remain visible and recoverable.
- [ ] Live and historical runs overlay the graph without mutating the draft.
- [ ] Approval, ACP, project, plugin, and secret contracts pass regression tests.
- [ ] Responsive Electron, keyboard accessibility, focus, contrast, and reduced motion are verified.
- [ ] Handoff truth and exact verification evidence are current.
