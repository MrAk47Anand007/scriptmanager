# ScriptManager Desktop Workbench — Design Spec

**Date:** 2026-06-11
**Status:** Approved by user (Approach A: VS Code-style workbench shell, perf-first, IPC-first in Electron)

## Goal

Turn ScriptManager into a desktop-first application with a native-feeling, attractive workbench UI, while keeping the existing self-hosted web/Docker mode working. Fix UI lag before visual work.

## Context (audit summary)

Already built: Scripts workspace (Monaco, collections, tags, templates, params/env, build history, per-collection Python venvs), Postman-like API client, Ops mode (SSH server profiles, remote execution with approval gates, audit trail), xterm+node-pty terminal with both WS and Electron IPC paths, mature Electron layer (splash, window-state, full IPC runtimes `desktopRuntime`/`apiRuntime`/`opsRuntime`, preload bridge, electron-builder config), CLI, webhooks, Docker/fly.io deploy, auth.

Lag culprits: monolithic components (`ScriptsSidebar.tsx` 2,068 lines; `ScriptsManager.tsx` 1,370 lines), broad Redux selectors (`selectors.ts` nearly empty), Monaco/xterm mounted inside heavy parents, no code-splitting.

Missing for desktop-first: native menu, tray, notifications, global shortcuts, file drag-in, auto-updater, scheduling UI (croner installed, unused), frameless title bar / desktop chrome.

## Architecture

### 1. Workbench shell

Frameless `BrowserWindow` with custom window controls over a draggable region. Fixed grid layout:

- **Title bar (32px):** app icon, workspace name, centered command-palette trigger, window controls (hidden in web mode).
- **Activity bar (48px left):** icon buttons — Scripts, API Client, Ops, Terminal, Settings. Replaces current mode toggles. Badge dots for running builds / pending approvals.
- **Side panel (collapsible, resizable):** context list per activity (script tree, API collections, server profiles). `ScriptsSidebar` decomposed into ~6 focused components (tree, search, collection header, context menus, drag layer, footer).
- **Editor area (tabbed):** open scripts and API requests as tabs with dirty-dot, backed by a new `tabsSlice`. Monaco mounts once; swaps models per tab.
- **Bottom dock (resizable, Ctrl+`):** Terminal / Output / Build history / Audit trail tabs. xterm instance persists across switches.
- **Status bar (24px):** runtime mode, active Python env, current build status, cursor position.

### 2. Performance (Phase 1, first)

- Split `ScriptsSidebar.tsx` / `ScriptsManager.tsx` into memoized components with narrow `createSelector` selectors.
- Virtualize script tree and build-history lists with `@tanstack/react-virtual` (already a dependency).
- Lazy-load Monaco, xterm, and the API module via `next/dynamic`.
- Single persistent Monaco instance + single persistent pty session; debounce editor onChange (local dirty buffer, commit to Redux on save).
- Audit `scriptsSlice` for whole-state selectors and fix.
- Validate with React DevTools profiler on: typing, script selection, tab switching with 100+ scripts.

### 3. IPC-first data layer

`runtimeAdapter` in `src/lib`: one interface, two implementations — IPC via `window.scriptManagerDesktop.runtime.*` when `__ELECTRON__`, HTTP fetch otherwise. Components are mode-agnostic. Desktop mode consumes build/terminal/remote-exec events via existing IPC subscriptions (`onBuildEvent`, `onTerminalEvent`, `onRemoteExecEvent`) instead of SSE/WS. New desktop capabilities get new namespaced IPC channels (`scriptmanager:*`).

### 4. Design system (full redesign)

- Token-based theme: Tailwind config + CSS variables. Dark-first deep-neutral palette, single accent, semantic colors for build states.
- 13px UI font, tabular numerals for logs, 4px spacing grid, subtle borders over shadows.
- 120–150ms ease-out transitions on panels/tabs/hover; animated tab open/close; skeleton loaders; toast notifications.
- Existing shadcn/ui components restyled via tokens — no library swap.

### 5. Desktop-native features (Phase 3)

- Native application menu + shortcuts (Ctrl+N new script, Ctrl+R run, Ctrl+P command palette — evolves the existing QuickSwitcher).
- System tray: quick-run pinned scripts, recent builds, show/hide window.
- Native notifications: build success/failure, approval requests.
- Drag files from Explorer into the tree to import scripts.
- Scheduling UI backed by croner, schedules persisted in Prisma, managed via IPC (HTTP route for web parity).
- Auto-updater (electron-updater, GitHub releases) — last, optional.

### 6. Error handling & testing

- IPC calls wrapped in typed result objects; failures surface as toasts, never crash the renderer.
- Web mode regression-checked at the end of each phase (adapter keeps HTTP paths alive).
- Perf before/after measurements with React DevTools profiler.

## Sequencing

1. **Phase 1 — Perf foundation:** component decomposition, selectors, virtualization, lazy-loading, runtimeAdapter.
2. **Phase 2 — Workbench shell + design system:** frameless chrome, activity bar, tabs, dock, tokens, micro-interactions.
3. **Phase 3 — Desktop-native features:** menu, tray, notifications, drag-in, scheduler UI, auto-updater.

## Out of scope

- Renderer rewrite off Next.js.
- Dropping web/Docker deployment.
- New component library.
