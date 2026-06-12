# Phase 3: Developer Features Implementation Plan

**Goal:** Make ScriptManager a daily-driver developer tool: command palette + global shortcuts, scheduler dashboard, native notifications + tray, cURL export, light-mode fix, and a feature-rich Ops mode.

**Context:** Phase 2 workbench shell is live (branch feat/phase2-workbench-shell): TitleBar/ActivityBar/SidePanel/EditorTabs/BottomDock/StatusBar, workbenchSlice, tabSync with draft tabs, Claude Code warm theme (slate→stone, blue→terracotta remaps). Verification = `npx tsc --noEmit` + `npx tsc -p electron/tsconfig.json --noEmit` (both 0 errors) + manual run. No test framework.

## Task 1: Light mode fix
- Retune `:root` light tokens in globals.css to warm paper tones matching the stone remap (wb-* surfaces currently cool 0 0% grays).
- Title-bar overlay (electron/main.ts) is hardcoded dark — add IPC `scriptmanager:set-titlebar-overlay` called from ThemeProvider/ModeToggle on theme change (win.setTitleBarOverlay) so window controls match the theme.

## Task 2: Command palette + shortcuts
- Promote QuickSwitcher into a real command palette (`src/components/workbench/CommandPalette.tsx`, rendered in WorkbenchShell — always mounted, portal/fixed):
  - Mode-less list: scripts AND api requests AND commands (prefix `>` for commands like VS Code, or unified scored list).
  - Commands: New Script, New API Request, Run Active Script, Send Active Request, Toggle Terminal/Dock, Open Settings, Switch activity, Toggle theme.
- Global shortcuts via a `useWorkbenchShortcuts` hook in WorkbenchShell: Ctrl+P (palette), Ctrl+Enter (run script / send request depending on active editor kind), Ctrl+W (close active tab), Ctrl+S already handled by editors — verify.
- Remove the old Ctrl+P listener in ScriptsSidebar; TitleBar button opens the new palette directly (no synthetic events).

## Task 3: Scheduler dashboard
- New dock-style full view or side-panel activity? → New 'schedules' section in the SCRIPTS side panel header + a dedicated editor-area view `src/components/SchedulesView.tsx` opened via command palette/activity badge:
  - Table of all scripts with cron set: name, cron (human-readable), next run (croner can compute), last run status, enable toggle, run-now button.
  - Data: extend scripts API/IPC to list schedules (schedule fields already exist per script; desktop runtime + web route).
- Keep scope: read + toggle + run-now; no new cron editor (per-script editor already exists).

## Task 4: Native notifications + tray
- electron/main.ts: build-finished events already flow through IPC — main process shows `new Notification({title, body})` on build success/failure when window unfocused; clicking focuses window.
- Tray: icon + context menu (Show/Hide, pinned scripts → run, recent builds status, Quit). Pinned = first N scripts or a `pinned` flag (keep simple: "Run last script").
- Renderer toggle in Settings: notifications on/off (localStorage/settings).

## Task 5: Copy as cURL + request polish
- `buildCurl(draft)` util (method, url with query, headers, body, auth) + "Copy as cURL" button in ApiRequestEditor toolbar + context menu on request rows.
- Duplicate request action in ApiSidebar context menu.

## Task 6: Ops mode revamp (design-first)
- Today: ops toggle reveals projects grouping, server profiles, remote exec with approval, audit trail. Pain: scattered (panels inside ScriptsManager right column), thin functionality.
- Revamp: 'ops' activity gets its own side panel content (server profiles list + projects) and editor-area dashboard:
  - Server cards: status (last connection test), env badge (prod/staging guarded), quick actions (test, transfer, execute).
  - Execution view: target picker, script picker, param form, live output (existing remote exec machinery), approval banner.
  - Audit timeline polish (filters by action/server/date).
- UI: same tokens; cards + status pills; this is mostly recomposition of existing panels into the workbench idiom.

Execution order: 1 → 2 → 3 → 4 → 5 → 6. Commit per task.
