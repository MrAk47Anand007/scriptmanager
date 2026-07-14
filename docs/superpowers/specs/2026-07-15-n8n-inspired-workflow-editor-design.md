# n8n-Inspired Workflow Editor Design

## Purpose

Upgrade ScriptManager's Workflow section from a static node grid into a production-quality visual automation editor. The editor should adopt the strongest interaction patterns from n8n while remaining visually and functionally native to ScriptManager.

The work covers the complete editor experience: canvas navigation, node creation and configuration, graph editing, validation, saving, publishing, execution inspection, accessibility, and responsive Electron behavior.

## Design Direction

The selected direction is the **ScriptManager Hybrid**.

It combines n8n-style canvas ergonomics and discoverability with ScriptManager's existing dark workbench, activity bar, workflow list, domain terminology, approval system, ACP agents, plugins, projects, secrets, and execution model. It is a reference-driven redesign rather than a visual clone.

### Visual thesis

A calm dark automation workbench with precise spacing, soft elevation, an orange action accent, muted category colors, and execution states that remain legible without turning the canvas into a dashboard.

### Interaction thesis

- Node placement and connection should feel immediate and spatially stable.
- Connection previews and inspector transitions should clarify cause and effect.
- Live execution motion should communicate progress briefly without becoming decorative noise.

## Editor Structure

The existing ScriptManager activity bar and Workflow sidebar remain the outer navigation model. The editor itself contains four primary regions:

1. **Command bar** — workflow identity, draft state, validation state, undo and redo, Save, Validate, Publish, and Run.
2. **Infinite canvas** — node graph, edges, selection, viewport controls, minimap, contextual quick-add, and empty state.
3. **Contextual inspector** — typed configuration for the selected node, with an advanced JSON mode.
4. **Execution drawer** — run history, live progress, node input and redacted output, logs, errors, attempts, approval context, and retry actions.

The permanent basic node palette is removed. Node creation moves to a searchable launcher opened from the command bar, empty canvas, keyboard shortcut, or a connection handle.

## Canvas Behavior

The canvas supports:

- Freeform node positioning.
- Mouse and trackpad pan and zoom.
- Fit-to-view and zoom controls.
- Optional minimap.
- Single selection, multi-selection, marquee selection, and selection clearing.
- Node dragging, group dragging, duplicate, delete, copy, paste, and select all.
- Undo and redo for graph and configuration edits.
- Curved, selectable connections with clear direction.
- Connection creation from visible input and output handles.
- Connection deletion and reconnection.
- Immediate rejection of invalid connections with a concise explanation.
- Automatic layout for legacy workflows that have no saved node positions.

Double-clicking empty canvas opens quick-add. Dragging from an output handle into empty canvas opens the node launcher and connects the chosen node in one operation.

## Node System

Nodes are compact blocks containing:

- Category icon and restrained category color.
- Node type and editable display name.
- Short configuration summary.
- Input and output handles.
- Validation badge when configuration is incomplete or invalid.
- Execution status when inspecting a run.

Special graph semantics remain visually explicit:

- Trigger nodes communicate that they start a workflow.
- Condition nodes expose labeled true and false outputs.
- Parallel nodes communicate branch creation.
- Join nodes communicate convergence.
- Approval nodes display waiting and decision states.
- Agent nodes display provider, profile, permission, and desktop-runtime states.

### Node registry

A single node registry is the source of truth for:

- Type and display name.
- Icon and category.
- Default configuration.
- Input and output handle definitions.
- Canvas summary.
- Inspector fields.
- Client-side validation.
- Search keywords.

The palette, quick-add launcher, node renderer, inspector, and validation UI all consume this registry so their behavior cannot drift independently.

### Node launcher

The launcher provides search, keyboard navigation, and these groups:

- Triggers.
- Actions.
- Flow control.
- AI agents.
- Communication.
- Plugins.

Recently used nodes appear first when no search query is active. Search matches names, categories, and registry keywords.

## Typed Inspector

JSON is no longer the default configuration experience. Each supported node receives a typed inspector that uses the existing workflow contracts:

- Script selection and inputs.
- API request selection and request-related configuration.
- Remote script and profile selection.
- Condition operands and operators.
- Transform mappings.
- Delay duration.
- Approval prompt and policy-related context.
- Parallel and join behavior.
- Notification channel and message.
- ACP provider, profile, prompt, and project binding.
- Plugin and plugin-node configuration.

The inspector provides clear required-field states and inline help. Advanced JSON mode remains available per node and validates parsed changes before committing them to the draft.

On narrow layouts, the inspector becomes an overlay instead of permanently reducing the canvas width.

## Workflow Lifecycle

The command bar distinguishes these states:

- Saved draft.
- Unsaved changes.
- Saving.
- Save failed.
- Published version.
- Validation errors.
- Running or waiting execution.

Save persists the current draft. Validate runs graph and node configuration checks. Publish remains blocked when validation has errors. Run continues to require a published workflow under the existing backend contract.

Failures remain visible until dismissed or superseded by a successful retry. No save, publish, or run failure is silent.

## Validation

Validation runs continuously after edits and on explicit request. Issues appear in two places:

- A badge on the affected node when the issue is node-specific.
- A compact validation panel containing all errors and warnings.

Selecting an issue focuses the relevant node when possible. Publish-blocking errors include:

- Schema violations.
- Cycles or invalid topology.
- Missing required configuration.
- Invalid mappings.
- Invalid or ambiguous connections.
- Unavailable project-bound resources.
- Unsupported runtime requirements.

The server remains authoritative during save and publish. Client validation improves feedback but does not replace server validation.

## Execution Experience

Starting or selecting a run overlays execution state onto the saved graph without modifying the draft.

Nodes can display:

- Pending.
- Running.
- Succeeded.
- Failed.
- Waiting.
- Waiting for approval.
- Skipped.
- Interrupted.
- Cancelled.

Running nodes receive a restrained pulse or progress treatment. Completed states remain visible through border, icon, and label changes that do not depend on color alone.

The execution drawer provides:

- Recent run history.
- Current run status and timing.
- Per-node input and redacted output.
- Attempts, logs, and error details.
- Correlation and provenance details where available.
- Retry node and retry-from-here actions where supported.
- Links to the shared Approval Inbox for approval nodes.
- Desktop-runtime guidance for ACP agent nodes.

Selecting a historical run loads its execution overlay and details without replacing the current workflow definition.

## State and Data Flow

Redux remains the renderer-side source of truth for the active draft. Workflow state expands to include:

- Node positions and graph viewport metadata.
- Current selection.
- Undo and redo history.
- Dirty and request lifecycle states.
- Validation issues.
- Selected execution and per-node execution overlays.

Canvas events dispatch focused graph actions rather than replacing the entire definition for every interaction. Save serializes the canonical workflow definition plus compatible editor metadata.

Existing workflow APIs remain the primary persistence and execution boundary. New API work should be limited to data the editor cannot obtain from the current endpoints, particularly richer run history or streaming execution detail.

Sensitive values remain opaque secret references. The editor must not place resolved secrets into Redux, node summaries, validation output, logs, execution overlays, or approval previews.

## Compatibility and Migration

Existing workflows must continue to load without manual migration.

- Definitions without editor positions receive a deterministic automatic layout.
- Existing node IDs, edges, configuration, published versions, and runtime behavior remain intact.
- Editor metadata must not change workflow execution semantics.
- Unknown or future node types render through a safe fallback node and remain inspectable in JSON mode rather than disappearing.

The implementation must preserve current workflow APIs and runtime contracts unless a separately tested compatibility change is required.

## Component Boundaries

The current compressed workflow components should be replaced by focused units with clear responsibilities:

- `WorkflowEditorShell` — region layout and responsive behavior.
- `WorkflowCommandBar` — lifecycle actions and request states.
- `WorkflowCanvas` — viewport, selection, drag, and connection orchestration.
- `WorkflowNode` — registry-driven node rendering.
- `WorkflowNodeLauncher` — searchable node discovery and placement.
- `WorkflowInspector` — typed forms and advanced JSON mode.
- `WorkflowValidationPanel` — issue navigation and severity display.
- `WorkflowExecutionDrawer` — run selection and node execution detail.
- `workflowNodeRegistry` — shared node metadata and inspector definitions.
- Focused Redux actions and selectors for graph, history, validation, and execution overlays.

Each component should be independently understandable and testable. Canvas-library objects should be adapted at the canvas boundary rather than leaking through the rest of the application.

## Technical Foundation

Use `@xyflow/react` as the canvas foundation for viewport management, dragging, selection, handles, connections, edges, keyboard behavior, controls, and minimap support.

The library is an interaction primitive, not the application state model. ScriptManager's workflow schema, Redux state, validation, permissions, and backend APIs remain authoritative.

## Responsive and Desktop Behavior

The target is the Electron workbench, with graceful behavior at narrower window sizes:

- The Workflow sidebar can collapse.
- The inspector becomes an overlay.
- The execution drawer is vertically resizable and can collapse to a status strip.
- Canvas controls remain reachable without overlapping primary actions.
- Keyboard and pointer interactions work without requiring hover-only discovery.

## Accessibility

The editor must provide:

- Keyboard access to node creation, selection, movement, connection management, deletion, duplication, undo, redo, and fit-to-view.
- Visible focus states.
- Accessible names for nodes, handles, controls, and status icons.
- Status communication that does not rely on color alone.
- Inspector labels and error associations.
- Reduced-motion behavior for connection and execution animation.
- Sufficient contrast in light and dark themes supported by the application.

## Error Handling

- Invalid graph operations are rejected without corrupting the draft.
- Invalid inspector JSON remains local to the editor until it parses and validates.
- Failed saves preserve dirty state and provide retry.
- Failed publish and run requests show the server response in context.
- A failed execution focuses the failed node and preserves run details.
- Execution-stream interruption falls back to refreshable persisted state.
- Unsupported or unavailable desktop capabilities produce actionable guidance.

## Testing Strategy

### Unit tests

- Node registry definitions and defaults.
- Typed inspector serialization.
- Graph actions, connection rules, and history behavior.
- Automatic layout compatibility.
- Validation-to-node issue mapping.
- Execution-status presentation.
- Secret-redaction regressions.

### Component tests

- Node launcher search and keyboard navigation.
- Canvas selection, add, move, connect, reconnect, duplicate, and delete flows.
- Typed inspector editing and advanced JSON validation.
- Command-bar lifecycle states.
- Validation issue navigation.
- Execution drawer and node detail behavior.
- Accessibility names, focus movement, and reduced motion.

### Integration tests

- Load and edit a legacy workflow.
- Save, validate, publish, and run a workflow.
- Display live and historical execution overlays.
- Inspect a failed node and retry it where supported.
- Navigate an approval node to the shared inbox.
- Preserve agent, project, plugin, and secret-reference contracts.

### Manual visual QA

- Electron desktop at common wide and narrow window sizes.
- Dense workflows, branching workflows, and long node names.
- Dark and supported light theme behavior.
- Zoom extremes, minimap, inspector overlay, and resizable execution drawer.
- Pointer, trackpad, and keyboard-only operation.

## Scope Boundaries

This redesign does not add n8n's integration catalog, credential system, expression language, collaboration model, or backend execution architecture. It improves ScriptManager's editor around the capabilities the product already owns.

Backend changes are in scope only where required to support editor metadata, richer execution inspection, or existing workflow capabilities that are not currently exposed to the UI.

## Acceptance Criteria

The redesign is complete when:

1. Existing workflows open and remain executable.
2. Users can construct and edit graphs through a true drag, zoom, pan, connect, and multi-select canvas.
3. Every supported node has a discoverable launcher entry and typed configuration experience.
4. Validation is continuous, navigable, and blocks invalid publishing.
5. Save, publish, and run states are explicit and recoverable on failure.
6. Live and historical executions can be inspected on the canvas without changing the draft.
7. Workflow security, approval, agent, project, plugin, and secret contracts remain intact.
8. Keyboard accessibility and responsive Electron behavior are verified.
9. Automated tests and manual visual QA cover the critical editor flows.
