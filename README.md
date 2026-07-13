# ScriptManager

> **Release status:** The 1.0 production path supports signed desktop installers and self-hosted Node.js 22 deployments with migration preflight, verified backup/restore, upgrade compatibility, security regression, accessibility, performance, Electron packaging, and cross-subsystem acceptance gates. Start with [the operator guide](docs/operator-guide.md).

A self-hosted, local-first script manager — write, run, schedule, and organize scripts with a professional web UI. Think of it as **n8n for scripts**: automation without the complexity.

![ScriptManager UI](https://github.com/MrAk47Anand007/scriptmanager/blob/main/Screenshot%202026-02-17%20145941.png)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [CLI Usage](#cli-usage)
- [Desktop App (Electron)](#desktop-app-electron)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Contributing](#contributing)
- [License](#license)

---

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [CLI Usage](#cli-usage)
- [Desktop App (Electron)](#desktop-app-electron)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Plugin SDK and local marketplace

- Versioned manifests with declared capabilities, settings schemas, workflow-node contributions, lifecycle hooks, compatibility metadata, and optional update URLs.
- Explicit workspace-scoped install, trust, enable, disable, settings, health, update-check, and uninstall flows.
- Ed25519 signature verification; unsigned packages require a visible local-development opt-in.
- Restricted host APIs for HTTP, execution events, opaque vault references, storage, notifications, and approved desktop capabilities—never Prisma, Electron internals, or raw secret plaintext.
- Namespaced `plugin:<plugin-id>:<node-type>` workflow nodes, public SDK types, a plugin generator, and tested workflow-node and notification examples. See [Plugin SDK](docs/plugins/SDK.md).

### Reliability foundation
- **Correlated execution events** — Script, API, webhook, scheduled, and remote runs emit redacted durable lifecycle events under one correlation ID.
- **Automated verification** — Vitest security/regression tests and GitHub Actions run unit tests and production builds.
- **Production encryption guard** — Production credential encryption requires an administrator-supplied secret and will not silently use the development fallback.

### Core
- **Monaco Editor** — Full VS Code-powered editor with syntax highlighting, autocomplete, and multi-language support (Python, JavaScript/Node.js, Shell/Bash, and custom interpreters).
- **Real-time Output Streaming** — Script output streams live to the console via Server-Sent Events (SSE) and WebSockets; no page refresh needed.
- **Build History** — Every execution is logged with status (`pending`, `running`, `success`, `failure`, `timeout`), duration, exit code, and full output. Logs are stored on disk and queryable via API.
- **Integrated Web Terminal** — A full xterm.js + node-pty terminal (PowerShell on Windows, Bash on Linux/macOS) accessible directly in the browser. Install dependencies, run git commands, or manage your system — all without leaving the app.

### Organization
- **Collections** — Group scripts into named folders. Scripts can be moved between collections with drag-and-drop.
- **Tags** — Color-coded labels for filtering and categorizing scripts. Tags are created on the fly and reusable across scripts.
- **Script Templates** — Built-in and custom starter templates (Python, JavaScript, Bash) to scaffold new scripts instantly.
- **Script Duplication** — Clone any script with one click.

### Automation
- **Visual Workflows** — Build versioned DAG workflows from scripts, API requests, conditions, transforms, delays, approvals, parallel branches, remote operations, and notifications.
- **Durable Workflow Runs** — Database-backed runs persist node attempts, outputs, retries, cancellation, approval pauses, and restart reconciliation.
- **Workflow Triggers** — Start published workflows manually, with cron schedules, or through encrypted HMAC-signed webhooks with replay protection.
- **Workflow Templates** — Start from script pipeline, API-to-script, approval deploy, or remote maintenance templates.
- **Webhooks** — Every script gets a unique HTTP POST endpoint. Send a request from IFTTT, Zapier, GitHub Actions, or any HTTP client to trigger execution. Supports optional HMAC-SHA256 signature verification (GitHub-compatible).
- **Cron Scheduling** — Built-in cron scheduler. Enter any standard cron expression and the server executes your script automatically. Next-run time displayed in the UI.
- **Execution Observability** — One operational dashboard for workflow, script, API, and remote runs with health metrics, filters, redacted causal timelines, correlation IDs, cancellation, targeted failed-node retry, and configurable execution-event retention.
- **Approval Inbox** — Review actor, risk, exact redacted operation, affected resource, expiry, and audit history; decide with Allow once, Allow for run, Always for workspace, or Reject.
- **Event Notifications** — Route typed execution and approval events to desktop, generic webhook, Slack, SMTP, or Teams channels using filters, templates, throttling, deduplication, audited delivery, and bounded retry state.
- **Shared Secret Vault** — Store versioned ciphertext behind opaque references with rotation, disable, scoped bindings, reveal-once access, audit history, server master-key encryption, and Electron OS-backed encryption. Script environments, Ops SSH, storage providers, API authentication, webhook signing, and notification transports resolve credentials only inside their authorized runtimes.
- **ACP Agent Workbench** — Run provider-neutral Codex or Claude agents from the Electron desktop, choose Observe, Develop, or Full access on first connection, inspect redacted transcripts and artifacts, interrupt/resume sessions, and use the same agent contract inside workflows.
- **Agent Approval Boundary** — Commands, file writes, Git operations, secret reads, remote execution, and deployments route through scoped approvals. Protected actions require a fresh decision even with Full access; browser-only sessions remain inspect-only.
- **Script Parameters** — Define typed, named parameters per script. Parameters are injected as environment variables at runtime and can be supplied via the UI, CLI, or webhook payload.
- **Environment Variables** — Per-script environment variables; secret values are vault-backed and resolve only for the bound script at execution time.
- **Execution Timeout** — Configurable timeout per script (or global default) to prevent runaway processes.

### Sync & Backup
- **GitHub Gist Sync** — Automatically sync any script to a private or public GitHub Gist on every save. One-click force-sync and the ability to unlink Gists are also supported.
- **Version History** — Keeps the last 10 snapshots of each script's content. Restore any prior version from the UI.

### Auth & Security
- **Password Authentication** — Session-based login with HMAC-signed cookies (`sm_session`). Sessions have configurable expiry.
- **Electron Desktop Bypass** — A secure ephemeral `DESKTOP_AUTH_SECRET` token is used when running as a packaged desktop app, so no login prompt appears.
- **Webhook Signature Verification** — Optional HMAC-SHA256 request signing (compatible with GitHub webhook format) to validate incoming webhook calls.

### UI & UX
- **Dark Mode** — Sleek dark-first interface built with Shadcn UI + Tailwind CSS.
- **Drag-and-drop** — Reorder scripts and move them between collections using `@dnd-kit`.
- **Responsive Layout** — Works on desktop and tablet viewports.
- **Context Menus** — Right-click on any script for quick actions (run, rename, duplicate, delete, move).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 15](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Database | SQLite via [Prisma ORM](https://www.prisma.io/) |
| State Management | [Redux Toolkit](https://redux-toolkit.js.org/) |
| Editor | [@monaco-editor/react](https://github.com/suren-atoyan/monaco-react) |
| Terminal | [xterm.js](https://xtermjs.org/) + [node-pty](https://github.com/microsoft/node-pty) |
| WebSocket Server | [ws](https://github.com/websockets/ws) |
| UI Components | [Radix UI](https://www.radix-ui.com/) + [Shadcn UI](https://ui.shadcn.com/) |
| Styling | Tailwind CSS |
| Icons | [Lucide React](https://lucide.dev/) |
| Drag & Drop | [@dnd-kit](https://dndkit.com/) |
| Desktop | [Electron](https://www.electronjs.org/) + [electron-builder](https://www.electron.build/) |
| Scheduling | [node-cron](https://www.npmjs.com/package/node-cron) |
| HTTP Client | [axios](https://axios-http.com/) |

---

## Project Structure

```
scriptmanager/
├── cli/
│   └── sm.mjs                  # CLI entry point (sm run, sm list, sm logs)
├── electron/
│   ├── main.ts                 # Electron main process (spawns server, manages window)
│   ├── preload.ts              # Context bridge (security)
│   └── tsconfig.json
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # SQL migration history
├── public/                     # Static assets
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── api/
│   │   │   ├── auth/           # Login / logout
│   │   │   ├── builds/         # Build logs, output, SSE streaming
│   │   │   ├── collections/    # Script collections CRUD
│   │   │   ├── env/            # Per-script environment variables
│   │   │   ├── scripts/        # Scripts CRUD, run, schedule, gist, webhook, tags, versions
│   │   │   ├── settings/       # Global app settings
│   │   │   ├── tags/           # Global tag management
│   │   │   ├── templates/      # Script templates CRUD
│   │   │   └── webhooks/       # Unauthenticated webhook trigger endpoint
│   │   └── (pages)/            # UI pages (login, main app)
│   ├── components/             # React UI components
│   │   └── ScriptsManager.tsx  # Main app shell
│   ├── features/
│   │   └── scripts/
│   │       └── scriptsSlice.ts # Redux slice (scripts, builds, collections, env vars, etc.)
│   ├── lib/
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── gistService.ts      # GitHub Gist sync logic
│   │   ├── scriptRunner.ts     # Script execution engine (async, streaming, timeout)
│   │   ├── scheduler.ts        # Cron scheduler
│   │   ├── socketService.ts    # WebSocket terminal server (node-pty)
│   │   └── types.ts            # Shared TypeScript types
│   └── middleware.ts           # Auth middleware (session validation, route protection)
├── server.ts                   # Custom Express-compatible server (WebSockets + Next.js)
├── .env                        # Environment variables
├── package.json
└── tsconfig.json
```

---

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3** — required if you plan to run Python scripts
- **Windows, Linux, or macOS** — all supported

> **Windows note:** If you see errors related to `node-pty` during `npm install`, run:
> ```bash
> npm install --global --production windows-build-tools
> ```

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up the Database

```bash
# Generate the Prisma client
npm run db:generate

# Apply migrations (creates ./data/scriptmanager.db)
npm run db:migrate
```

### 3. Configure Environment

Create a `.env` file in the project root:

```env
# Required: SQLite database path
DATABASE_URL="file:./data/scriptmanager.db"

# Optional: change the port (default: 3000)
PORT=3000

# Optional: session secret for cookie signing (change in production!)
SESSION_SECRET="your-secret-here"
```

### 4. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You'll be prompted to log in.

### Production Build

```bash
npm run build
npm start
```

---

## Configuration

### Application Settings (UI)

Navigate to the **Settings** tab in the UI to configure:

| Setting | Description |
|---|---|
| Admin Password | Password used to log into the web UI |
| GitHub Token | Personal access token for GitHub Gist sync (`gist` scope required) |
| Script Storage Path | Directory where script files are saved (default: `./user_scripts`) |
| Default Gist Sync | Whether new scripts sync to Gist by default |
| Global Execution Timeout | Default script timeout in milliseconds |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./data/scriptmanager.db` | Prisma database connection string |
| `PORT` | `3000` | HTTP server port |
| `SESSION_SECRET` | `scriptmanager-dev-secret-change-me` | HMAC secret for session cookies |
| `DESKTOP_AUTH_SECRET` | _(auto-generated)_ | Electron desktop authentication secret |
| `SCRIPTS_DIR` | `./user_scripts` | Override script storage directory |
| `BUILDS_DIR` | `./builds` | Override build log directory |

---

## Usage Guide

### Writing & Running Scripts

1. Click **New Script** in the sidebar.
2. Choose a language (Python, JavaScript, Shell, or Custom interpreter).
3. Write your code in the Monaco editor.
4. Click **Run** — output streams live to the Console pane below the editor.
5. Click **Save** (or use `Ctrl+S`) to persist your changes.

### Script Parameters

Parameters allow you to pass dynamic values to scripts at runtime:

1. Open the **Parameters** panel in the sidebar.
2. Add parameters with a name, type (`string`, `number`, `boolean`), and optional default value.
3. When running manually, a dialog prompts for parameter values.
4. Parameters are injected as environment variables (e.g., a param named `my_input` becomes `$MY_INPUT`).

### Environment Variables

Per-script environment variables are stored in the database:

1. Open **Env Vars** in the sidebar for the active script.
2. Add key/value pairs. Mark sensitive values as **Secret** to mask them in the UI.
3. All env vars are automatically available to the script at runtime.

### Build History

- Every run (manual, scheduled, or webhook-triggered) creates a **Build** record.
- View past builds in the **Build History** panel.
- Click any build to see its full output log.
- Builds display status, triggered-by source, start/end times, and exit code.

### Integrated Terminal

- Click **Open Terminal** in the Console header.
- A full interactive terminal (PowerShell/Bash) appears in the browser.
- Use it to install packages (`pip install pandas`, `npm install axios`), run git, or debug your environment.
- The terminal persists across script switches and can be minimized.

### Collections & Tags

- **Collections:** Click the folder icon or right-click a script to move it to a collection. Create and delete collections from the sidebar.
- **Tags:** Add color-coded tags to any script. Filter the sidebar by tag to find scripts quickly.

### Webhooks

Each script has a unique webhook URL:

```
POST http://your-host:3000/api/webhooks/{token}
```

- Trigger the script from any external service (IFTTT, Zapier, GitHub Actions, etc.).
- The webhook endpoint is **unauthenticated** by design — the token acts as the secret.
- **Signature Verification:** Enable HMAC-SHA256 signing in the script's Webhook panel. Send the `X-Hub-Signature-256` header (compatible with GitHub's webhook format) to validate requests.
- **Payload:** The raw JSON body is passed to the script via `WEBHOOK_PAYLOAD` env var.
- Regenerate the webhook token or secret at any time from the UI.

### Cron Scheduling

1. Open the **Schedule** panel for a script.
2. Enter a valid cron expression (e.g., `*/15 * * * *` for every 15 minutes).
3. Toggle **Enable**.
4. The scheduler runs server-side; scripts execute automatically while the server is running.

### GitHub Gist Sync

1. Add your GitHub Personal Access Token in **Settings** (requires `gist` scope).
2. Toggle **Sync to Gist** on any script.
3. The script is pushed to a private Gist on every save.
4. Use **Force Sync** to push immediately, or **Unlink Gist** to detach.

### Version History

- ScriptManager keeps the last 10 saved snapshots of every script.
- Open the **Versions** panel to browse and restore any previous version.

---

## CLI Usage

ScriptManager ships with `sm`, a command-line interface for running and managing scripts from your terminal.

### Installation

```bash
# Run directly from the project
node ./cli/sm.mjs --help

# Or use the npm script alias
npm run cli -- --help
```

### Configure the CLI

```bash
# Point the CLI at your running ScriptManager instance
sm config set baseUrl http://localhost:3000
sm config set apiKey <your-session-token>
```

### Commands

```bash
# List all scripts
sm list

# Run a script (streams output to stdout)
sm run "My Script Name"

# Run with parameters
sm run "My Script" --param KEY=value --param OTHER=value

# View the latest build log for a script
sm logs "My Script Name"
```

The CLI authenticates using the same session mechanism as the web UI and streams SSE output directly to your terminal.

---

## Desktop App (Electron)

ScriptManager can be packaged as a native desktop application using Electron.

### Development Mode

```bash
npm run electron:dev
```

This starts both the Next.js server and Electron concurrently. The desktop window bypasses web authentication using a shared `DESKTOP_AUTH_SECRET`.

### Build a Distributable

```bash
# Package without installer (for local testing)
npm run electron:pack

# Build full installers (NSIS on Windows, DMG on macOS, AppImage on Linux)
npm run electron:build
```

Built artifacts are output to the `release/` directory.

### How it Works

- In production, Electron spawns the standalone Next.js server on port `3141`.
- An ephemeral `DESKTOP_AUTH_SECRET` is generated each launch and injected as a session cookie, bypassing the password login screen.
- The SQLite database and scripts are stored in the OS user data directory (`app.getPath('userData')`), so data persists across app updates.

---

## API Reference

All routes (except `/api/webhooks/` and `/api/auth/`) require a valid session cookie.

### Scripts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scripts` | List all scripts |
| `POST` | `/api/scripts` | Create or update a script |
| `GET` | `/api/scripts/:id` | Get script with content |
| `DELETE` | `/api/scripts/:id` | Delete a script |
| `POST` | `/api/scripts/:id/run` | Trigger a manual run |
| `POST` | `/api/scripts/:id/duplicate` | Duplicate a script |
| `GET` | `/api/scripts/:id/schedule` | Get schedule |
| `PUT` | `/api/scripts/:id/schedule` | Save/update schedule |
| `DELETE` | `/api/scripts/:id/schedule` | Delete schedule |
| `GET` | `/api/scripts/:id/tags` | List script tags |
| `POST` | `/api/scripts/:id/tags` | Add a tag |
| `DELETE` | `/api/scripts/:id/tags?tagId=` | Remove a tag |
| `GET` | `/api/scripts/:id/versions` | List version snapshots |
| `GET` | `/api/scripts/:id/versions/:versionId` | Get a version's content |
| `POST` | `/api/scripts/:id/gist/sync` | Force Gist sync |
| `DELETE` | `/api/scripts/:id/gist` | Unlink Gist |
| `POST` | `/api/scripts/:id/webhook/regenerate` | Regenerate webhook token |
| `POST` | `/api/scripts/:id/webhook/secret` | Regenerate HMAC secret |
| `PUT` | `/api/scripts/:id/webhook/secret` | Toggle signature requirement |
| `PUT` | `/api/scripts/:id/move` | Move to a collection |

### Builds

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/builds/:scriptId` | List builds for a script |
| `GET` | `/api/builds/output/:scriptId/:buildId` | Get build output |
| `GET` | `/api/builds/:buildId/stream` | Stream live output (SSE) |

### Collections

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/collections` | List all collections |
| `POST` | `/api/collections` | Create a collection |
| `DELETE` | `/api/collections/:id` | Delete a collection |

### Environment Variables

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/env/:scriptId` | List env vars for a script |
| `POST` | `/api/env/:scriptId` | Create an env var |
| `PUT` | `/api/env/:scriptId/:id` | Update an env var |
| `DELETE` | `/api/env/:scriptId/:id` | Delete an env var |

### Templates, Tags & Settings

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/templates` | List script templates |
| `POST` | `/api/templates` | Create a template |
| `GET` | `/api/tags` | List all tags |
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Update settings |

### Webhooks (unauthenticated)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhooks/:token` | Trigger a script by webhook token |
| `GET` | `/api/webhooks/:token` | Check webhook info |

### Auth

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Log in (returns session cookie) |
| `POST` | `/api/auth/logout` | Log out (clears session cookie) |

---

## Database Schema

ScriptManager uses **SQLite** via Prisma with the following models:

- **`Script`** — Core entity. Stores name, filename, language, interpreter, parameters (JSON), webhook token/secret, schedule cron, Gist metadata, collection link, and timeout.
- **`Build`** — Execution record. Tracks status, triggered-by, log file path, start/finish times, and exit code.
- **`Collection`** — Named folder for grouping scripts.
- **`Tag`** / **`ScriptTag`** — Color-coded labels with a many-to-many join to scripts.
- **`ScriptEnvVar`** — Per-script environment variables with optional secret masking.
- **`ScriptVersion`** — Snapshot of script content at save time. Keeps last 10 per script.
- **`ScriptTemplate`** — Reusable starter templates (built-in and user-created).
- **`Setting`** — Key/value store for global application settings.
- **`User`**, **`Workspace`**, and **`Membership`** — Optional multi-user identity and workspace tenancy. Local desktop installs bootstrap one administrator-owned default workspace.
- **`Role`** / **`RolePermission`** — Server-enforced `resource:action` permissions with owner, admin, developer, operator, approver, and viewer presets plus custom roles.
- **`WorkspaceInvitation`** / **`UserSession`** — Expiring invitations and hashed, expiring, individually revocable sessions.

### Workspace access and RBAC

Authenticated API requests are checked in the Node middleware against the current membership before protected routes run. Script, workflow, secret, agent, approval, Ops, and Git resources are workspace-scoped; ID-based access rejects a resource owned by another workspace. Agent actions additionally intersect the initiating user's permissions, the selected agent access profile, workspace policy, and protected-action approval rules.

Workspace owners and authorized administrators can manage members, invitations, custom roles, active sessions, reusable approval/agent grants, and workspace audit history from **Settings → Workspace Access**.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Install dependencies: `npm install`
3. Set up the database: `npm run db:migrate`
4. Start the dev server: `npm run dev`
5. Make your changes and add tests where appropriate.
6. Open a pull request with a clear description of the change.

---

## License

MIT — see [LICENSE](LICENSE) for details.
