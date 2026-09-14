# ScriptManager

A local-first automation workbench for scripts, APIs, workflows, and AI agents — built as a fast native desktop app with **Tauri 2 + Rust**. Think of it as **n8n for scripts**: serious automation without the complexity.

Everything runs on your machine. No server, no browser tabs, no login — just launch the app.

![Scripts & API Workbench](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/scriptandapi.png)

---

## Table of Contents

- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Feature Tour](#feature-tour)
  - [Scripts](#scripts)
  - [API Client](#api-client)
  - [Visual Workflows](#visual-workflows)
  - [AI Agents & MCP](#ai-agents--mcp)
  - [Ops Console & Remote Execution](#ops-console--remote-execution)
  - [Git Repository Workspace](#git-repository-workspace)
  - [Executions & Observability](#executions--observability)
  - [Secret Vault & Security](#secret-vault--security)
  - [Settings & Configuration](#settings--configuration)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)

---

## Highlights

- **Truly local** — an embedded SQLite database and a workspace folder on your disk; your scripts and secrets never leave your machine unless you send them somewhere yourself.
- **One lightweight executable** — a Rust core instead of a bundled browser-plus-Node runtime, so it starts instantly and sips memory.
- **Script runner** — Monaco editor, live streaming output, per-script parameters, environment variables, timeouts, version history, and an integrated terminal.
- **Visual workflows** — drag-and-drop DAG builder with versioned publishes, live run events, per-node inspection, and cron/webhook-style triggers.
- **API testing suite** — collections, environments, OpenAPI 3 import, no-code assertions, data-driven runs, mock servers, and JUnit/HTML reports.
- **AI agents** — run Codex or Claude agent sessions locally with approval gates, and expose your saved scripts, workflows, and requests to AI apps through a built-in MCP server.
- **Remote ops** — SSH/SFTP execution, server profiles, fleet runs (one command, many servers), stability reports, and a full audit trail.
- **Git built in** — stage, diff, commit, push/pull, and browse history for any linked project folder without leaving the app.

## Screenshots

| | |
|---|---|
| ![Workflow Automation](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/workflowautomation.png) | ![AI Agents & DevOps](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/aianddevops.png) |
| ![Repository Management](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/repomanagement.png) | ![Executions Monitoring](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/exemoni.png) |
| ![Settings & Configuration](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/settingsconfig.png) | |

---

## Feature Tour

### Scripts

- **Monaco editor** — full VS Code-powered editing with syntax highlighting and autocomplete for Python, JavaScript/Node.js, Shell/Bash, and custom interpreters.
- **Live output streaming** — script output streams to the console pane as it runs; no refresh needed.
- **Parameters & env vars** — typed, named parameters injected as environment variables at runtime; per-script env vars with masked secret values.
- **Execution controls** — configurable per-script timeout with global default, kill/cancel of running scripts, and on-demand terminal sessions.
- **Version history** — the last saved snapshots of every script, restorable from the Versions panel.
- **Organization** — collections with drag-and-drop, color-coded tags, templates, one-click duplication, and a command palette (`Ctrl+P`).

### API Client

- **Collections & environments** — organize requests, share values through environments and global variables.
- **OpenAPI 3 import** — bring in JSON/YAML specs to scaffold collections instantly (Postman JSON import too).
- **Declarative assertions** — no-code response checks alongside pre/post scripts powered by an embedded JS engine.
- **Data-driven runs** — run a request or whole collection against a dataset and inspect per-iteration results.
- **Reports** — export collection runs as JUnit XML or styled HTML.
- **Mock servers** — spin up local mocks to develop against before the real API exists.

### Visual Workflows

- **Drag-and-drop DAG builder** — script, API, condition, transform, delay, approval, parallel branch, remote, and notification nodes — plus `foreach`, sub-workflow, and `try/catch`.
- **Versioned publishes** — saved and published workflow versions with validation before release.
- **Live run events** — watch nodes execute in real time, inspect per-node output, retry failed nodes, or resume from any node.
- **AI authoring** — generate a workflow from a plain-language prompt and get failure diagnosis when a run breaks.
- **Triggers** — start runs manually, on a schedule, or from webhook events.

![Workflow Automation](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/workflowautomation.png)

### AI Agents & MCP

- **Local agent sessions** — run Codex or Claude agents (via ACP) against a workspace folder you choose, with Observe/Develop/Full access levels.
- **Approval boundary** — commands, file writes, git operations, secret reads, and remote execution route through scoped approvals; protected actions always require a fresh decision.
- **Built-in MCP server** — your AI apps (e.g. Claude Desktop) can call your saved workflows, scripts, and API requests — only when you ask.
- **Live session control** — inspect redacted transcripts and artifacts, interrupt and resume sessions.

![AI Agents & DevOps](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/aianddevops.png)

### Ops Console & Remote Execution

- **Server profiles** — store SSH connections with banner-verified transport and vault-backed credentials.
- **Remote execution** — run commands on any profile, with an SFTP browser for remote files.
- **Fleet execution** — fan one command out to many selected servers in a single run.
- **Reports & stability scoring** — flake detection and stability reports across your run history.
- **Audit trail** — every remote and fleet run is recorded with who/what/when and full output.

### Git Repository Workspace

- **Connect any folder** — link a project directory and manage it without leaving the app.
- **Stage & diff** — review additions and deletions in a visual diff view, then commit with a message.
- **Sync** — fetch, pull, and push against your remote; browse the commit history graph.
- **Workspace sync** — keep your whole ScriptManager workspace (scripts, collections, workflows) in a git repository.

![Repository Management](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/repomanagement.png)

### Executions & Observability

- **One dashboard** — workflow, script, API, and remote runs unified with health metrics and filters.
- **Causal timelines** — correlated, redacted lifecycle events under a single correlation ID per run.
- **Approval inbox** — review actor, risk, affected resource, and expiry; decide with Allow once, Allow for run, Always, or Reject.

![Executions Monitoring](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/exemoni.png)

### Secret Vault & Security

- **Encrypted vault** — versioned ciphertext behind opaque references, with rotation, scoped bindings, reveal-once access, and audit history.
- **Scoped resolution** — script environments, SSH profiles, API authentication, and notification transports resolve credentials only inside their authorized runtimes.
- **Plugin sandbox** — plugins run against capability-scoped host APIs and signed manifests; nothing gets raw secrets by default.

### Settings & Configuration

- **Workspace storage** — pick your workspace root; scripts and API collections are organized into folders inside it.
- **Appearance** — working dark and light mode.
- **Cloud storage & Gist sync** — sync scripts to S3/GCS/WebDAV/OneDrive-style providers or GitHub Gists.
- **Security, notifications, plugins, workspace access** — all managed in-app.

![Settings & Configuration](https://raw.githubusercontent.com/MrAk47Anand007/scriptmanager/main/images/settingsconfig.png)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri 2](https://tauri.app/) |
| Backend | Rust (Tokio async runtime, sqlx + SQLite, russh SSH/SFTP) |
| Frontend | React 19 + TypeScript + Vite |
| State | Redux Toolkit |
| Editor | Monaco (`@monaco-editor/react`) |
| Terminal | xterm.js |
| Workflows | React Flow + Rust workflow engine |
| Scripting engine | Boa (embedded JavaScript for API assertions) |
| UI | Radix UI + Shadcn UI + Tailwind CSS |
| Icons | Lucide |

## Project Structure

```
scriptmanager/
├── tauri-app/                  # The desktop application
│   ├── src/                    # React UI (scripts, workflows, API client, ops, agents, settings)
│   │   ├── components/         # Feature components and views
│   │   ├── features/           # Redux slices
│   │   └── lib/                # Client-side engines (workflow worker, notifications, bridge)
│   └── src-tauri/              # Rust backend
│       ├── src/                # Commands, workflow engine, SSH transport, MCP server,
│       │                       # scheduler, notifications, secrets, git integration
│       ├── tests/              # Rust test suites
│       └── tauri.conf.json     # Window, bundle, and build configuration
├── images/                     # README screenshots
└── docs/                       # Operator guide and design docs
```

## Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Rust** (stable toolchain) — [rustup.rs](https://rustup.rs)
- Platform requirements for Tauri on your OS (WebView2 on Windows is auto-installed by the installer)
- **Python 3** / interpreters you want your scripts to use

### Run in Development

```bash
cd tauri-app
npm install
npm run dev        # frontend only (Vite, hot reload)
```

### Build the Desktop App

```bash
cd tauri-app
npm run tauri:build
```

Artifacts land in `tauri-app/src-tauri/target/release/` (executable) and `tauri-app/src-tauri/target/release/bundle/` (Windows NSIS installer).

### Useful Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run tauri:build` | Full production build + installer |
| `npm run tauri:build:no-bundle` | Build the executable without the installer |
| `npm run lint` | Oxlint checks |
| `npm run guard:desktop-bridge` | Verify the desktop bridge contract |

---

## Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file.
