# ScriptManager

A self-hosted, local-first script manager for writing, running, scheduling, and organizing scripts — like n8n but for scripts.

## Features

- **Script Editor** — Write Python, JavaScript (Node), Shell, or custom interpreter scripts
- **Run & Stream** — Execute scripts with real-time console output streaming
- **Collections** — Organize scripts in named folders with drag-and-drop
- **Webhooks** — Trigger scripts via HTTP POST to a unique URL
- **Cron Scheduling** — Run scripts automatically on a cron schedule
- **GitHub Gist Sync** — Sync scripts to private GitHub Gists for backup/sharing
- **Build History** — Track all script executions with logs

## Tech Stack

- **Next.js 15** (App Router) — Full-stack, single server
- **Prisma + SQLite** — Zero-setup local database
- **Redux Toolkit** — Frontend state management
- **React** + **Tailwind CSS** + **Radix UI** — UI

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3 (for running Python scripts)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client
npm run db:generate

# 3. Run database migrations (creates data/scriptmanager.db)
npm run db:migrate

# 4. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production

```bash
npm run build
npm start
```

## Configuration

Edit `.env.local` to customize:

```env
# Database path
DATABASE_URL="file:./data/scriptmanager.db"

# Where user scripts are stored
SCRIPTS_DIR="./user_scripts"

# Where build logs are stored
BUILDS_DIR="./builds"

# Server port (default 3000)
PORT=3000
```

## Webhook Usage

Trigger a script via HTTP:

```bash
curl -X POST http://localhost:3000/api/webhooks/<your-webhook-token>

# With JSON payload
curl -X POST http://localhost:3000/api/webhooks/<token> \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

## GitHub Gist Sync

1. Generate a GitHub Personal Access Token with the `gist` scope at [github.com/settings/tokens](https://github.com/settings/tokens)
2. Paste it in **Settings → GitHub Integration**
3. Toggle the **Gist** switch in the script editor toolbar to sync

## Multi-Language Support

ScriptManager supports multiple interpreters per script:

| Language | Interpreter |
|---|---|
| Python | `python3` (or `python` on Windows) |
| JavaScript | `node` |
| Shell/Bash | `bash` (or `cmd` on Windows) |
| Custom | Any interpreter path (e.g. `/usr/bin/ruby`, `deno run`) |

## License

MIT
