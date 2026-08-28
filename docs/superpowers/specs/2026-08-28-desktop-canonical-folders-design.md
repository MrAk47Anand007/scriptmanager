# Desktop Canonical Folders Design

## Goal

Make imported local folders the canonical source of truth for ScriptManager scripts in the Electron application. ScriptManager indexes, edits, runs, and watches those files in place without maintaining a competing managed copy. The desktop renderer uses preload/IPC for normal local folder and script operations.

## Scope

This design covers Electron folder registration and import, file indexing and watching, atomic writes, external-change handling, recovery drafts, canonical-path execution, and desktop IPC contracts.

It does not change hosted web behavior, add cloud synchronization, or redesign workflow, Git, agent, or notification features. The existing managed workspace remains available only for newly created scratch scripts and recovery drafts.

## Product Rules

- An imported folder is canonical: its files are edited and executed in place.
- ScriptManager never copies an imported script into its managed workspace as a fallback execution source.
- External file changes reload the canonical script automatically.
- If an editor has unsaved changes when an external update arrives, ScriptManager saves those changes as a recoverable local draft, then reloads the canonical file.
- Recovery drafts never execute automatically and never overwrite canonical files without a user action.
- If a folder becomes unavailable, its metadata and drafts remain available but its scripts cannot run until it is reconnected or removed.
- Normal Electron renderer operations use preload/IPC, not local `/api/*` routes.

## Architecture

Electron is the filesystem authority. It owns durable folder registration, recursive indexing, file watching, atomic writes, and draft storage. The Next.js server is not involved in these local operations.

The desktop runtime persists a registered-root record and a script index record in SQLite. Each imported script has a canonical absolute path, its root ID, a content revision marker, and ScriptManager-specific metadata. The canonical file itself remains the source for file content, filename, language, and modification state.

```text
Imported folder
  -> Electron folder registry
  -> Electron indexer and watcher
  -> SQLite metadata/index
  -> preload IPC events and commands
  -> renderer editor and script tree

External file update
  -> watcher event
  -> dirty editor draft save (when needed)
  -> canonical file read
  -> renderer reload event
```

## Data Model

Add a durable `LocalFolderRoot` concept with an ID, absolute path, display name, import timestamp, availability status, and last scan time. Imported script records reference their root and canonical path.

ScriptManager-only state remains in SQLite and references the script record: tags, parameters, schedules, run history, environment bindings, collection/project mapping, and UI metadata. A script's `sourcePath` is authoritative for imported scripts.

Recovery drafts live under Electron user data, keyed by script ID and timestamp. Draft metadata stores the canonical path, source content revision, creation time, and encrypted draft body when the OS secret store is available.

## IPC Contract

The preload bridge exposes only narrow operations:

- register and list local folder roots;
- scan or rescan a root;
- read a canonical script;
- create a script inside a selected root;
- save a canonical script atomically;
- reconnect or remove an unavailable root;
- list, restore, and discard recovery drafts;
- subscribe to root availability and indexed-file change events.

Events contain script IDs, root IDs, event types, canonical content revision, and availability details. The renderer does not receive arbitrary filesystem access.

## Import And Indexing

Import registers a selected directory without copying files. The indexer recursively scans supported script extensions, derives language/interpreter defaults, and creates or updates records tied to canonical paths.

Watcher events reconcile external creates, changes, deletes, and renames. Renames retain script identity when the watcher provides a reliable move pairing; otherwise the index treats them as a delete followed by a create. A startup reconciliation scan ensures SQLite and the filesystem agree after a restart.

## Editing And External Changes

Saving writes a temporary sibling file, flushes it, and renames it over the canonical file. This avoids partially written scripts and produces one watcher-visible update.

When the watcher reports a canonical change:

1. Electron reads the updated file and records the new revision.
2. If the matching renderer editor is dirty, the renderer sends its unsaved value to Electron for recovery-draft storage.
3. Electron broadcasts the canonical update.
4. The renderer reloads the canonical content and surfaces a non-blocking action to inspect, restore, or discard the saved draft.

The app never silently discards unsaved editor data and never silently replaces the external canonical content with a draft.

## Execution

Script execution resolves the canonical path and starts the configured interpreter with the script's parent directory as its working directory. Unavailable roots or missing files block execution with an actionable reconnect/remove state. No managed-copy fallback is permitted.

## Failure And Recovery

Folder removal, permission failures, mount loss, and missing paths mark a root unavailable. The UI keeps its scripts visible with an unavailable status, preserves all metadata and recovery drafts, disables execution and writes, and offers reconnect or remove actions.

Draft storage failures do not overwrite canonical content. The editor receives an explicit error and retains its in-memory content until the user resolves the issue.

## Verification

Unit and integration coverage will verify:

- import indexes files without creating managed copies;
- external create, change, delete, and rename reconciliation;
- atomic canonical saves;
- dirty-editor draft preservation before automatic reload;
- draft restore and discard behavior;
- unavailable-root state and reconnect recovery;
- execution uses the canonical path and parent working directory;
- renderer operations use preload IPC in Electron mode.

A packaged Electron smoke flow will import a folder, edit a script, mutate it externally, confirm draft recovery, and run the canonical file.
