# Contributing to ScriptManager

Thanks for helping improve ScriptManager. Bug reports, documentation fixes, tests, and focused pull requests are welcome. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before starting

- Check existing issues and pull requests to avoid duplicate work. For a larger feature or behavior change, open an issue first so the approach can be discussed.
- Never include real credentials, tokens, private scripts, or workspace databases in an issue or pull request. For a suspected vulnerability, contact the maintainer privately through their [GitHub profile](https://github.com/MrAk47Anand007) rather than posting exploit details publicly.
- The current desktop app lives in `tauri-app/`. The root `package.json` belongs to the earlier Next.js/Electron application and its release tooling; use commands from the directory you changed.

## Set up the desktop app

Install Node.js, npm, the stable Rust toolchain, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system. Then:

```bash
cd tauri-app
npm ci
npm run dev
```

`npm run dev` starts the Vite frontend. To run the native desktop shell, use `npx tauri dev` from the same directory.

## Make a change

1. Create a branch from the current `main` branch.
2. Keep the change focused. Update relevant documentation and tests when behavior changes.
3. Run the checks relevant to your files:

   ```bash
   cd tauri-app
   npm run lint
   npm run guard:desktop-bridge
   npm run guard:no-api-fallback
   npx vitest run
   npm run build
   ```

   For Rust changes, also run `cargo fmt --check` and `cargo test` from `tauri-app/src-tauri/`. If you change the legacy root app, run its relevant `npm` scripts from the repository root instead.
4. Open a pull request using the repository template. Explain the change, link the issue if there is one, and record the checks you ran. Include screenshots or a short recording for visible UI changes.

If a check needs hardware, credentials, or an external service you do not have, state that plainly in the pull request.
