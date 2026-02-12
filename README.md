# ScriptManager

A self-hosted, local-first script manager for writing, running, scheduling, and organizing scripts — like n8n but for scripts.

![ScriptManager UI](/screenshot.png)

## Features

- **Script Editor** — Professional styling with **Monaco Editor** (VS Code), supporting Python, JavaScript (Node), Shell, and custom interpreters.
- **Integrated Terminal** — Full-featured web terminal (PowerShell/Bash) to install packages (`npm`, `pip`), run git commands, or manage your system alongside your scripts.
- **Run & Stream** — Execute scripts with real-time console output streaming via WebSockets.
- **File Management** — Organize scripts in named collections. **Configurable storage path** allows you to save scripts anywhere on your disk.
- **Webhooks** — Trigger any script via a unique HTTP POST URL (great for IFTTT/Zapier integrations).
- **Cron Scheduling** — Built-in cron scheduler to run scripts automatically.
- **GitHub Gist Sync** — Backup and share scripts privately or publicly via GitHub Gists.
- **Build History** — Persistent logs for every execution (success/failure status, duration, output).
- **Dark Mode UI** — Sleek, responsive interface built with Shadcn UI and Tailwind CSS.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite + Prisma (Zero config, local file)
- **State Management**: Redux Toolkit
- **Terminal**: xterm.js + node-pty
- **UI**: React + Tailwind CSS + Lucide Icons + Radix UI

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Python 3** (if running Python scripts)
- **Windows/Linux/Mac** supported

### Installation

1.  **Install dependencies**
    ```bash
    npm install
    # On Windows, if you encounter errors with node-pty, ensure you have build tools:
    # npm install --global --production windows-build-tools
    ```

2.  **Setup Database**
    ```bash
    # Generate Prisma Client
    npm run db:generate

    # Run Migrations (creates ./data/scriptmanager.db)
    npm run db:migrate
    ```

3.  **Start Server**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm start
```

## Configuration

You can configure the application via the **Settings** tab in the UI, or by setting environment variables in `.env`.

### UI Settings
- **GitHub Token**: For Gist syncing.
- **Script Storage Path**: Choose a custom folder on your disk to store scripts (defaults to `./user_scripts`).

### Environment Variables (.env)
```env
# Database connection
DATABASE_URL="file:./data/scriptmanager.db"

# Server Port
PORT=3000
```

## Usage Guide

### Running Scripts
- Click **Run** to execute immediately.
- Output streams in real-time to the Console Output pane.
- View past runs in the **Build History** sidebar.

### Using the Terminal
- Click **Open Terminal** in the Console Output header.
- A fully functional terminal will appear below the editor.
- Use it to install dependencies: `pip install pandas` or `npm install axios`.
- Minimize it to keep it running in the background.

### Webhooks
- Every script has a unique **Webhook URL** shown in the sidebar.
- Send a `POST` request to trigger it.
- **Payloads**: Any JSON body sent to the webhook is available to the script via environment variables or arguments (depending on implementation).

### Scheduling
- Enable the **Schedule** toggle.
- Enter a standard cron expression (e.g., `*/15 * * * *` for every 15 mins).
- The server will run the script automatically as long as it's running.

## License

MIT
