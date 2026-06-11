# Phase 2: Workbench Shell + Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the website-style top-nav layout with a VS Code-style desktop workbench (title bar, activity bar, side panel, tabbed editor, bottom dock, status bar) and a refreshed token-based design system, keeping web mode working.

**Architecture:** A new `WorkbenchShell` component owns the fixed grid; existing feature components (ScriptsSidebar's tree, Monaco editor area, ApiManager, terminal/output panels) are rehomed into shell slots, not rewritten. A new `workbenchSlice` holds UI chrome state (active activity, panel sizes, open tabs, dock visibility). The Electron window is ALREADY frameless with `titleBarOverlay` (electron/main.ts:579-586) — the shell renders the custom title bar in both modes; web mode just has no overlay reserve.

**Tech Stack:** Next.js 15, React 19, Redux Toolkit, react-resizable-panels (installed), Tailwind + CSS variables (shadcn token system in src/app/globals.css), lucide-react.

**Verification per task:** `npx tsc --noEmit` (must stay 0 errors) + boot `npm run electron:dev` for visual checks. No test framework — do not add one.

**Sequencing note:** Tasks 1–2 are foundations (tokens, slice). Tasks 3–7 build the shell around existing components, one region at a time, each leaving the app fully usable. Task 8 is polish.

---

### Task 1: Design tokens — refined dark-first palette + accent

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Extend the CSS variables**

In `globals.css`, keep the shadcn variable names (components depend on them) but retune values and add workbench tokens. Replace the `.dark` block values and append new tokens to both `:root` and `.dark`:

```css
:root {
  /* existing shadcn vars stay; add: */
  --accent-brand: 217 91% 60%;        /* blue-500 family — single accent */
  --wb-titlebar: 0 0% 98%;
  --wb-activitybar: 0 0% 96%;
  --wb-sidepanel: 0 0% 97.5%;
  --wb-statusbar: 0 0% 96%;
  --wb-border: 0 0% 89%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --running: 217 91% 60%;
}
.dark {
  --background: 240 6% 7%;            /* deep neutral, slightly blue */
  --border: 240 5% 16%;
  --accent-brand: 217 91% 60%;
  --wb-titlebar: 240 6% 9%;
  --wb-activitybar: 240 6% 8%;
  --wb-sidepanel: 240 6% 8.5%;
  --wb-statusbar: 217 91% 22%;
  --wb-border: 240 5% 14%;
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --running: 217 91% 60%;
}
```

Also add to the base layer: `font-variant-numeric: tabular-nums` on a `.font-logs` utility class, and a global `transition` guideline class:

```css
@layer utilities {
  .font-logs { font-variant-numeric: tabular-nums; font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; }
  .wb-transition { transition: background-color 130ms ease-out, color 130ms ease-out, opacity 130ms ease-out; }
}
```

- [ ] **Step 2: Map tokens in tailwind.config.ts**

Add to `theme.extend.colors`:

```ts
'accent-brand': 'hsl(var(--accent-brand))',
success: 'hsl(var(--success))',
warning: 'hsl(var(--warning))',
running: 'hsl(var(--running))',
wb: {
  titlebar: 'hsl(var(--wb-titlebar))',
  activitybar: 'hsl(var(--wb-activitybar))',
  sidepanel: 'hsl(var(--wb-sidepanel))',
  statusbar: 'hsl(var(--wb-statusbar))',
  border: 'hsl(var(--wb-border))',
},
```

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit` → 0 errors; boot app — existing UI unchanged except slightly retuned dark background.

```bash
git add src/app/globals.css tailwind.config.ts
git commit -m "feat: add workbench design tokens (accent, semantic states, wb surfaces)"
```

---

### Task 2: workbenchSlice — chrome state

**Files:**
- Create: `src/features/workbench/workbenchSlice.ts`
- Create: `src/features/workbench/selectors.ts`
- Modify: `src/store/store.ts` (register reducer)

- [ ] **Step 1: Create the slice**

```ts
// src/features/workbench/workbenchSlice.ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ActivityId = 'scripts' | 'api' | 'ops' | 'settings'
export type DockTabId = 'terminal' | 'output' | 'builds' | 'audit'

export interface EditorTab {
  id: string                       // `script:<id>` or `api:<requestId>`
  kind: 'script' | 'api'
  entityId: string
  title: string
  dirty: boolean
}

interface WorkbenchState {
  activeActivity: ActivityId
  sidePanelVisible: boolean
  dockVisible: boolean
  activeDockTab: DockTabId
  tabs: EditorTab[]
  activeTabId: string | null
}

const initialState: WorkbenchState = {
  activeActivity: 'scripts',
  sidePanelVisible: true,
  dockVisible: false,
  activeDockTab: 'terminal',
  tabs: [],
  activeTabId: null,
}

const workbenchSlice = createSlice({
  name: 'workbench',
  initialState,
  reducers: {
    setActiveActivity(state, action: PayloadAction<ActivityId>) {
      if (state.activeActivity === action.payload) {
        state.sidePanelVisible = !state.sidePanelVisible
      } else {
        state.activeActivity = action.payload
        state.sidePanelVisible = true
      }
    },
    toggleDock(state) { state.dockVisible = !state.dockVisible },
    setDockVisible(state, action: PayloadAction<boolean>) { state.dockVisible = action.payload },
    setActiveDockTab(state, action: PayloadAction<DockTabId>) {
      state.activeDockTab = action.payload
      state.dockVisible = true
    },
    openTab(state, action: PayloadAction<Omit<EditorTab, 'dirty'>>) {
      if (!state.tabs.some(t => t.id === action.payload.id)) {
        state.tabs.push({ ...action.payload, dirty: false })
      }
      state.activeTabId = action.payload.id
    },
    closeTab(state, action: PayloadAction<string>) {
      const idx = state.tabs.findIndex(t => t.id === action.payload)
      if (idx === -1) return
      state.tabs.splice(idx, 1)
      if (state.activeTabId === action.payload) {
        state.activeTabId = state.tabs[Math.min(idx, state.tabs.length - 1)]?.id ?? null
      }
    },
    setActiveTab(state, action: PayloadAction<string>) { state.activeTabId = action.payload },
    setTabDirty(state, action: PayloadAction<{ id: string; dirty: boolean }>) {
      const tab = state.tabs.find(t => t.id === action.payload.id)
      if (tab) tab.dirty = action.payload.dirty
    },
    renameTab(state, action: PayloadAction<{ id: string; title: string }>) {
      const tab = state.tabs.find(t => t.id === action.payload.id)
      if (tab) tab.title = action.payload.title
    },
  },
})

export const {
  setActiveActivity, toggleDock, setDockVisible, setActiveDockTab,
  openTab, closeTab, setActiveTab, setTabDirty, renameTab,
} = workbenchSlice.actions
export default workbenchSlice.reducer
```

- [ ] **Step 2: Selectors file** — per-field primitive selectors in `src/features/workbench/selectors.ts`, same pattern as the other selectors files (selectActiveActivity, selectSidePanelVisible, selectDockVisible, selectActiveDockTab, selectTabs, selectActiveTabId).

- [ ] **Step 3: Register** the reducer in `src/store/store.ts` under key `workbench`.

- [ ] **Step 4: Verify + commit**

`npx tsc --noEmit` → 0.

```bash
git add src/features/workbench src/store/store.ts
git commit -m "feat: add workbench slice for shell chrome state"
```

---

### Task 3: WorkbenchShell skeleton + title bar + status bar

**Files:**
- Create: `src/components/workbench/WorkbenchShell.tsx`
- Create: `src/components/workbench/TitleBar.tsx`
- Create: `src/components/workbench/StatusBar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build the shell grid**

`WorkbenchShell` renders the fixed regions and accepts the editor area as children. Keep page.tsx's existing bootstrap logic; replace its header/nav JSX with the shell:

```tsx
// src/components/workbench/WorkbenchShell.tsx
'use client'
import { type ReactNode } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'

export function WorkbenchShell({ activityBar, sidePanel, dock, children }: {
  activityBar: ReactNode
  sidePanel: ReactNode | null
  dock: ReactNode | null
  children: ReactNode
}) {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <div className="w-12 shrink-0 border-r border-wb-border bg-wb-activitybar">{activityBar}</div>
        {sidePanel}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{children}</div>
          {dock}
        </div>
      </div>
      <StatusBar />
    </div>
  )
}
```

- [ ] **Step 2: TitleBar**

Port the existing `desktop-titlebar` / `desktop-no-drag` drag-region classes from page.tsx's header (search globals.css for their definitions — they exist for the current Electron overlay). TitleBar: 36px, `bg-wb-titlebar`, app icon + workspace name left, centered command-palette button (`Ctrl+P` hint, opens the existing QuickSwitcher for now), AutoSave switch + OpsModeToggle + ModeToggle right (moved from the old header). In desktop mode (`isDesktop()` from `@/lib/runtime`) add right padding for the Windows window-controls overlay (the old header used `pr-40`).

- [ ] **Step 3: StatusBar**

24px bar, `bg-wb-statusbar` in dark. Left: runtime mode chip ("Desktop"/"Web" from `isDesktop()`), active collection's Python env label (from existing collection data of the active script). Right: run status (`selectRunStatus`) with `text-running/success/destructive` colors, save status (`selectSaveStatus`).

- [ ] **Step 4: Wire into page.tsx** — replace the `<header>` block with `<WorkbenchShell activityBar={<ActivityBarPlaceholder/>} sidePanel={null} dock={null}>` wrapping the existing `<main>` panel-stack content. Old top-nav buttons keep working via a temporary ActivityBarPlaceholder rendering the same three buttons vertically (replaced properly in Task 4).

- [ ] **Step 5: Verify + commit** — tsc 0 errors; boot both `npm run electron:dev` and web `npm run next:dev`: header replaced, all three views reachable, window dragging works in desktop.

```bash
git add src/components/workbench src/app/page.tsx
git commit -m "feat: add WorkbenchShell with title and status bars"
```

---

### Task 4: ActivityBar with badges

**Files:**
- Create: `src/components/workbench/ActivityBar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Build ActivityBar**

Vertical icon rail: Code2 (scripts), Globe (api), Server (ops — only when ops mode active), SquareTerminal (toggles dock terminal), Settings at bottom. Active item: 2px left accent-brand indicator + brighter icon. Badge dots: running build (`selectRunStatus === 'running'` → pulsing `bg-running` dot on scripts icon), pending remote approvals (ops selectors) → `bg-warning` dot on ops icon. Each button: 48×48 hit area, lucide icon 20px, `wb-transition`, `title` tooltip.

Clicking dispatches `setActiveActivity` (workbenchSlice) — page.tsx maps `activeActivity` to its existing `activeTab` state (replace the useState with the Redux value; keep the mountedTabs lazy-mount logic).

- [ ] **Step 2: Verify + commit** — tsc 0; switching activities works, side panel toggle on re-click works (collapses ScriptsSidebar region in Task 5; for now no-op), badges appear when running a script.

```bash
git add src/components/workbench/ActivityBar.tsx src/app/page.tsx
git commit -m "feat: add ActivityBar with running/approval badges"
```

---

### Task 5: Side panel rehome + collapse

**Files:**
- Modify: `src/components/ScriptsManager.tsx` (sidebar lives inside it today — lift it out)
- Modify: `src/components/api/ApiManager.tsx` (same for ApiSidebar)
- Modify: `src/app/page.tsx`
- Create: `src/components/workbench/SidePanel.tsx`

- [ ] **Step 1: Inspect current composition.** ScriptsManager renders `<ScriptsSidebar/>` + editor area in a resizable split; ApiManager similarly. Lift the sidebars: ScriptsManager and ApiManager accept a `hideSidebar` prop (default false, web fallback unchanged) OR export their sidebar separately — choose the lighter touch after reading both files; goal is that page.tsx renders `<SidePanel>` containing the active activity's sidebar, and the managers render only their editor halves when in the shell.

- [ ] **Step 2: SidePanel** — resizable (react-resizable-panels, already used in the managers — reuse the same primitives from '@/components/ui/resizable'), `bg-wb-sidepanel`, min 200px / default 280px, hidden when `sidePanelVisible` is false (animate width 130ms). Persist width to localStorage key `wb_sidepanel_width`.

- [ ] **Step 3: Verify + commit** — tsc 0; scripts tree and API tree appear in the shared panel, collapse via activity re-click works, resizing persists across reload, web mode still fine.

```bash
git add -A src/
git commit -m "feat: rehome sidebars into shared collapsible SidePanel"
```

---

### Task 6: Tabbed editor area

**Files:**
- Create: `src/components/workbench/EditorTabs.tsx`
- Modify: `src/components/ScriptsManager.tsx`
- Modify: `src/components/api/ApiManager.tsx`

- [ ] **Step 1: EditorTabs strip** — renders `selectTabs`; each tab: kind icon (FileCode2 / Globe), title, dirty dot (`●` accent-brand) or close ×, active tab `bg-background` against `bg-wb-sidepanel` strip, middle-click close, `wb-transition`. Overflow: horizontal scroll with hidden scrollbar.

- [ ] **Step 2: Open-tab wiring** — selecting a script in the tree (existing `onSelectScript` path in ScriptsSidebar → scriptsSlice setActiveScript) ALSO dispatches `openTab({ id: 'script:'+id, kind:'script', entityId:id, title:name })`. Same for API request selection in ApiSidebar. Clicking a tab dispatches the reverse: `setActiveTab` + the feature's set-active action (setActiveScript / api equivalent) — add a small `useTabSync` hook in EditorTabs.tsx that maps tab activation to feature dispatches and keeps tab dirty state in sync with the editor dirty state (scriptsSlice already tracks unsaved content for the active script — find the exact flag, e.g. what UnsavedIndicator in ScriptTree reads, and mirror it via setTabDirty).
- Closing a dirty tab: confirm via `window.confirm` ("Discard unsaved changes?") — keep simple, no new dialog.
- Monaco stays as-is in ScriptsManager (it already swaps content by activeScriptId — model-per-tab optimization deferred; note as Phase 3 candidate if switching feels slow).
- Switching activity (scripts↔api) keeps tabs; the editor area renders the manager matching the ACTIVE TAB's kind, not the activity (activity controls only the side panel).

- [ ] **Step 3: Verify + commit** — tsc 0; opening scripts/API requests creates tabs, dirty dots track edits, close/middle-click works, switching tabs switches editor content, no tab → empty-state panel.

```bash
git add -A src/
git commit -m "feat: add tabbed editor area driven by workbench slice"
```

---

### Task 7: Bottom dock (terminal / output / builds / audit)

**Files:**
- Create: `src/components/workbench/BottomDock.tsx`
- Modify: `src/components/ScriptsManager.tsx` (extract its console-output/build-history/terminal sections into dock panes)
- Modify: `src/app/page.tsx`

- [ ] **Step 1: BottomDock** — resizable height (default 280px, min 120px, persist `wb_dock_height`), tab strip (Terminal / Output / Builds / Audit — Audit only in ops mode), close chevron, driven by workbenchSlice (`dockVisible`, `activeDockTab`). Keyboard: Ctrl+` toggles (`window` keydown listener in the shell; don't fire when Monaco has focus and is consuming — check `e.defaultPrevented`).

- [ ] **Step 2: Move panes** — ScriptsManager's existing `ConsoleOutputSection`, `BuildHistorySection`, `TerminalComponent` mount points and AuditTrailPanel move into BottomDock panes. CRITICAL: TerminalComponent must stay MOUNTED when the dock hides or switches tabs (xterm + pty session must survive) — render all panes always, hide inactive with `display:none` (`hidden` class), same pattern page.tsx already uses for tab panels. Running a script auto-opens the dock on Output (`setActiveDockTab('output')` from the existing run handler).

- [ ] **Step 3: Verify + commit** — tsc 0; terminal session survives dock hide/show and tab switches; run auto-opens Output; Ctrl+` toggles; existing 'scriptmanager:open-terminal' CustomEvent now opens the dock terminal tab.

```bash
git add -A src/
git commit -m "feat: add bottom dock hosting terminal, output, builds, audit"
```

---

### Task 8: Micro-interactions + visual polish pass

**Files:**
- Modify: `src/components/workbench/*` and `src/components/ui/*` as needed

- [ ] **Step 1:** Apply `wb-transition` consistently (activity icons, tab hover, dock tabs, side panel rows). Tab open/close: animate width/opacity 130ms via CSS (no animation lib). Skeletons: reuse existing SectionSkeleton style for side panel load. Toast: check if a toast exists; if not, add a minimal `src/components/ui/toast.tsx` (fixed bottom-right, auto-dismiss 4s, success/error variants using semantic tokens) and surface IPC/fetch errors that currently only console.error in the runtime clients.
- [ ] **Step 2:** Sweep remaining `slate-*` hardcoded colors in workbench components to token classes (don't sweep the whole app — only files this phase touched).
- [ ] **Step 3: Verify + commit** — tsc 0; visual pass in both themes.

```bash
git add -A src/
git commit -m "feat: workbench micro-interactions and token polish"
```

---

### Task 9: Web regression + wrap-up

- [ ] **Step 1:** `npm run next:dev` → login, scripts CRUD, run with output, API tab, settings — all functional in browser (no window-controls padding, drag regions inert).
- [ ] **Step 2:** `npm run electron:dev` → window drag via title bar, overlay controls usable, all Phase 1 perf behavior intact (typing/dialogs/tree).
- [ ] **Step 3:** Commit any fixes; merge decision goes back to the user.
