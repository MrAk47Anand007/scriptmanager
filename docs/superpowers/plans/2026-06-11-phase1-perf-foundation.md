# Phase 1: Performance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate UI lag by fixing whole-slice Redux subscriptions, decomposing the 2,068-line ScriptsSidebar, virtualizing the script tree, and formalizing the IPC-first runtime adapter — without changing visible behavior.

**Architecture:** The root cause of lag is `ScriptsSidebar` subscribing to the entire `state.scripts` slice while `appendBuildOutput` mutates that slice on every output chunk. Fix order: (1) narrow subscriptions, (2) extract dialog sub-components so their local state doesn't live in the tree component, (3) virtualize the tree, (4) unify the three runtime clients behind one adapter. Each task leaves the app working.

**Tech Stack:** Next.js 15, React 19, Redux Toolkit (`createSelector`), `@tanstack/react-virtual` (already installed), Electron IPC bridge (`window.scriptManagerDesktop`).

**Note on testing:** This repo has no test framework (no jest/vitest in package.json). Adding one for a UI-perf refactor is out of scope. Verification per task = `npx tsc --noEmit` (typecheck), app boot via `npm run electron:dev`, and React DevTools Profiler measurements. Do NOT introduce a test framework in this plan.

---

### Task 0: Record baseline profiler measurements

**Files:** none (measurement only)

- [ ] **Step 1: Start the app**

Run: `npm run electron:dev`
Expected: Electron window opens with scripts workspace.

- [ ] **Step 2: Record baseline**

With React DevTools Profiler (in the Electron devtools, Ctrl+Shift+I):
1. Start profiling, run a script that prints ~200 lines, stop profiling. Note total render count and duration of `ScriptsSidebar`.
2. Start profiling, click between 5 scripts in the sidebar. Note commit durations.
3. Start profiling, type 20 characters in the Monaco editor. Note whether `ScriptsSidebar` re-renders.

- [ ] **Step 3: Save numbers**

Write the three measurements into `docs/superpowers/plans/phase1-perf-baseline.md` (plain notes, e.g. "script run: ScriptsSidebar rendered 214× / 1,800ms total"). Commit:

```bash
git add docs/superpowers/plans/phase1-perf-baseline.md
git commit -m "chore: record perf baseline before phase 1 refactor"
```

---

### Task 1: Isolate build output from the scripts slice subscription

**Files:**
- Modify: `src/features/scripts/selectors.ts`
- Modify: `src/components/ScriptsSidebar.tsx` (the `useAppSelector((state) => state.scripts)` destructure near line 513)

- [ ] **Step 1: Add narrow selectors for everything the sidebar destructures**

Open `ScriptsSidebar.tsx` and list every field pulled from the `const { ... } = useAppSelector((state) => state.scripts)` destructure (lines ~505–513). For each field that does not already have a selector in `src/features/scripts/selectors.ts`, add one, following the existing pattern:

```ts
// add to src/features/scripts/selectors.ts — one per missing field, e.g.:
export const selectScriptsStatus = (state: RootState) => state.scripts.status
// (repeat for each destructured field actually used by the sidebar)
```

- [ ] **Step 2: Replace the whole-slice subscription**

In `ScriptsSidebar.tsx`, delete the whole-slice destructure and replace with one `useAppSelector` per field:

```ts
const items = useAppSelector(selectScriptItems)
const collections = useAppSelector(selectCollections)
const activeScriptId = useAppSelector(selectActiveScriptId)
// ...one line per field previously destructured.
// CRITICAL: the sidebar must NOT subscribe to builds/build output fields
// unless it actually renders them. Check each usage before keeping it.
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors in `tsc_output.txt` are acceptable if unchanged).

- [ ] **Step 4: Verify behavior + re-profile**

Run `npm run electron:dev`. Repeat baseline measurement #1 (run a script printing ~200 lines while profiling). Expected: `ScriptsSidebar` renders ≤2 times during the run (status change only), not once per output chunk.

- [ ] **Step 5: Commit**

```bash
git add src/features/scripts/selectors.ts src/components/ScriptsSidebar.tsx
git commit -m "perf: replace whole-slice subscription in ScriptsSidebar with narrow selectors"
```

---

### Task 2: Audit remaining whole-slice subscriptions

**Files:**
- Modify: any component matching the pattern below

- [ ] **Step 1: Find offenders**

Run: `npx rg "useAppSelector\(\(state\) => state\.(scripts|api|ops)\)" src --no-heading`
Also: `npx rg "useAppSelector\(\(state\) => \{" src --no-heading` (object-returning selectors create new references every dispatch).

- [ ] **Step 2: Fix each one**

For each hit, replace with narrow field selectors (same pattern as Task 1). For object-returning selectors, either split into per-field selectors or wrap with `createSelector` in the relevant `features/*/selectors.ts` file (create `src/features/api/selectors.ts` / `src/features/ops/selectors.ts` if needed, mirroring `src/features/scripts/selectors.ts`).

- [ ] **Step 3: Typecheck and verify**

Run: `npx tsc --noEmit` → no new errors. Boot app, click through Scripts / API / Ops views — all render as before.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "perf: narrow remaining whole-slice Redux subscriptions"
```

---

### Task 3: Extract creation/deletion dialogs out of ScriptsSidebar

**Files:**
- Create: `src/components/sidebar/CreateScriptDialog.tsx`
- Create: `src/components/sidebar/CreateCollectionDialog.tsx`
- Create: `src/components/sidebar/OpenFolderDialog.tsx`
- Create: `src/components/sidebar/DeleteScriptDialog.tsx`
- Create: `src/components/sidebar/DeleteCollectionDialog.tsx`
- Create: `src/components/sidebar/PythonEnvDialog.tsx`
- Create: `src/components/sidebar/SaveAsTemplateDialog.tsx`
- Modify: `src/components/ScriptsSidebar.tsx`

Each dialog currently contributes 3–10 `useState` hooks to the sidebar (lines ~514–580); any dialog keystroke re-renders the whole tree. Move each dialog's JSX **and its form state** into its own file. The sidebar keeps only an "is open / target entity" trigger.

- [ ] **Step 1: Extract CreateScriptDialog**

Create `src/components/sidebar/CreateScriptDialog.tsx` with this interface; move the corresponding `<Dialog>` JSX and the `newScriptName`, `newScriptDescription`, `isCreatingScript`, `syncToGistOverride` state from ScriptsSidebar into it:

```tsx
'use client'
import { useState } from 'react'

export interface CreateScriptDialogProps {
  open: boolean
  parentCollectionId: string | null
  onOpenChange: (open: boolean) => void
  /** invoked with the form values; parent dispatches the thunk */
  onCreate: (values: { name: string; description: string; collectionId: string | null; syncToGist: boolean }) => Promise<void>
}

export function CreateScriptDialog({ open, parentCollectionId, onOpenChange, onCreate }: CreateScriptDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [syncToGist, setSyncToGist] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // ...JSX moved verbatim from ScriptsSidebar, wired to this local state
}
```

In `ScriptsSidebar.tsx`, delete the moved state hooks and render `<CreateScriptDialog open={isCreateScriptOpen} ... />`, keeping only `isCreateScriptOpen` + `parentCollectionId` in the sidebar. The `onCreate` handler is the existing dispatch logic, passed down.

- [ ] **Step 2: Typecheck + manual check**

`npx tsc --noEmit` → clean. Boot app, create a script via the dialog — works as before.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/CreateScriptDialog.tsx src/components/ScriptsSidebar.tsx
git commit -m "refactor: extract CreateScriptDialog from ScriptsSidebar"
```

- [ ] **Step 4–10: Repeat extraction for the remaining six dialogs, one commit each**

Same recipe per dialog (state moved: collection-create → `newCollectionName`, `newCollectionRuntimePreset`, `newCollectionPythonTools`, `isSubmittingCollection`; open-folder → `folderPath`, `folderMode`, `folderCollectionName`, `folderRuntimePreset`, `folderPythonTools`, `folderCreateVenvIfMissing`, `folderInspection`, `isOpeningFolder`, `openFolderError`, `browserFolderFiles`; delete-script → `scriptToDelete`, `deleteFromGist`, `isDeleting`; delete-collection → `collectionToDelete`, `pendingCollectionDeleteId`; python-env → `pythonEnvCollection`, `pythonEnvStatus`, `isPythonEnvLoading`, `pythonEnvError`; save-as-template → `saveAsSourceScript`, `saveAsTemplateName`, `saveAsDescription`, `saveAsCategory`, `saveAsError`, `saveAsLoading`). Props follow the same `open / target / onOpenChange / onSubmit` shape as Step 1. Typecheck + manual check + commit after each:

```bash
git commit -m "refactor: extract <DialogName> from ScriptsSidebar"
```

---

### Task 4: Extract and virtualize the script tree

**Files:**
- Create: `src/components/sidebar/ScriptTree.tsx`
- Modify: `src/components/ScriptsSidebar.tsx`

- [ ] **Step 1: Extract the tree render into ScriptTree**

Move `DraggableScript`, `CollectionScriptRows`, `DroppableCollection` (already `memo`-wrapped, lines ~121–510) plus the tree-mapping JSX into `src/components/sidebar/ScriptTree.tsx`:

```tsx
'use client'
import { memo } from 'react'

export interface ScriptTreeProps {
  collections: Collection[]            // already filtered/sorted by parent
  scriptsByCollection: Map<string | null, Script[]>
  expandedCollections: Record<string, boolean>
  activeScriptId: string | null
  onToggleCollection: (id: string) => void
  onSelectScript: (id: string) => void
  // context-menu / drag callbacks passed through unchanged
}

export const ScriptTree = memo(function ScriptTree(props: ScriptTreeProps) {
  // moved JSX
})
```

- [ ] **Step 2: Flatten + virtualize**

Inside `ScriptTree`, compute a flat row list (collection headers + visible scripts of expanded collections) with `useMemo`, then render through `useVirtualizer`:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const rows = useMemo(() => flattenTree(collections, scriptsByCollection, expandedCollections), [collections, scriptsByCollection, expandedCollections])
const parentRef = useRef<HTMLDivElement>(null)
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (i) => (rows[i].kind === 'collection' ? 32 : 28),
  overscan: 12,
})
// render: <div ref={parentRef} className="h-full overflow-y-auto">
//   <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
//     {virtualizer.getVirtualItems().map(vi => <Row key={rows[vi.index].key} style={{ position:'absolute', top:0, transform:`translateY(${vi.start}px)` }} ... />)}
```

`flattenTree` is a pure function defined in the same file returning `Array<{ kind: 'collection'; collection: Collection; key: string } | { kind: 'script'; script: Script; collectionId: string | null; key: string }>`.

Keep `@dnd-kit` drag-and-drop working: the `DndContext` stays in ScriptsSidebar; virtual rows render the existing `DraggableScript`/`DroppableCollection` wrappers.

- [ ] **Step 3: Typecheck + manual check**

`npx tsc --noEmit` → clean. Boot app: expand/collapse, select, drag a script between collections, context menus — all work. Scroll a collection with many scripts — smooth.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/ScriptTree.tsx src/components/ScriptsSidebar.tsx
git commit -m "perf: extract ScriptTree and virtualize sidebar rows"
```

---

### Task 5: Formalize the runtime adapter

**Files:**
- Create: `src/lib/runtime/index.ts`
- Modify: callers that branch on `hasDesktopScriptsRuntime()` inline (find with `npx rg "hasDesktop" src --no-heading -l`)

The three clients (`scriptsRuntimeClient.ts`, `apiRuntimeClient.ts`, `opsRuntimeClient.ts`) already implement IPC-vs-HTTP. This task adds a single entry point so future code (Phase 2/3) never branches per call site.

- [ ] **Step 1: Create the facade**

```ts
// src/lib/runtime/index.ts
export * from '@/lib/scriptsRuntimeClient'
export * from '@/lib/apiRuntimeClient'
export * from '@/lib/opsRuntimeClient'

/** true when running inside the Electron shell */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__ELECTRON__)
}
```

- [ ] **Step 2: Replace ad-hoc `window.__ELECTRON__` checks**

Run: `npx rg "window\.__ELECTRON__" src --no-heading -l` — replace each inline check (except the one defining `isDesktop` and the bootstrapping in `page.tsx` body-dataset effect) with `isDesktop()` imported from `@/lib/runtime`.

- [ ] **Step 3: Typecheck + commit**

`npx tsc --noEmit` → clean.

```bash
git add src/lib/runtime/index.ts src/
git commit -m "refactor: add unified runtime facade with isDesktop()"
```

---

### Task 6: Verify web mode + record post-refactor measurements

- [ ] **Step 1: Web mode regression check**

Run: `npm run dev`, open `http://localhost:3000` in a browser. Create a script, run it, watch output stream, open the API tab. All must work (HTTP paths).

- [ ] **Step 2: Re-run the three profiler measurements from Task 0** (in Electron)

Append results to `docs/superpowers/plans/phase1-perf-baseline.md` under an "After" heading. Success criteria: script-output run renders `ScriptsSidebar` ≤2×; dialog typing renders only the dialog; tree scroll ≥55fps feel.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/phase1-perf-baseline.md
git commit -m "chore: record post-refactor perf measurements for phase 1"
```
