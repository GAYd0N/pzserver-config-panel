## Project Overview

Local web control panel for configuring and operating multiple Project Zomboid server instances, built with TypeScript, Express, and a framework-free browser frontend.

## Tech Stack

- Language: TypeScript 5.9 (backend), JavaScript ES modules (frontend)
- Runtime / Framework: Node.js >= 18, Express 5.1
- Storage: local `servers-config.json` and Project Zomboid INI files; no database
- Testing: Vitest 4, Node by default and `happy-dom` for frontend suites
- Package Manager: npm

## Structural Map

```text
pzserver-config-panel/
|- src/
|  |- server.ts                 # Express composition and process entrypoint
|  |- cli-options.ts            # Host, port, and legacy config CLI parsing and URL helpers
|  |- routes/                   # Health, config, instance, runtime, and terminal HTTP APIs
|  |- config/
|  |  |- servers-config.ts      # Multi-instance persistence, validation, defaults, and migration
|  |  |- service.ts             # INI read/write orchestration, locking, and backup flow
|  |  |- workshop-parser.ts     # Workshop mod.info and map discovery
|  |  |- workshop-files.ts      # Safe recursive removal of Workshop item directories
|  |  \- ...                    # INI parsing, serialization, encoding, lock, and backup helpers
|  |- runtime/
|  |  |- manager.ts             # Single-active child-process lifecycle and terminal control
|  |  \- terminal-buffer.ts     # Per-instance in-memory log ring buffer
|  |- scheduler/
|  |  |- cron.ts                # Five-field cron parsing and matching
|  |  \- command-scheduler.ts   # Minute-based execution of scheduled instance commands
|  |- types/                    # Shared config, instance, runtime, and terminal types
|  |- errors/                   # AppError codes and HTTP response conversion
|  |- middleware/               # Express error handling
|  \- rules/                    # zh-CN INI labels and administrator command catalog
|- public/
|  |- instance-select.html      # Instance selection, CRUD, and global settings page
|  |- index.html                # Selected-instance configuration and runtime console
|  |- style.css                 # Shared responsive layout and themes
|  \- js/
|     |- app.js                 # Management page initialization and event orchestration
|     |- instance-select.js     # Instance list behavior and management-page navigation
|     |- api.js                 # Browser API client
|     |- config.js              # INI rendering, collection, save, and autosave
|     |- mods.js                # Workshop mods, dependencies, conflicts, maps, and ordering
|     |- server-manager.js      # Runtime polling, start/stop, and global settings UI
|     |- terminal.js            # SSE output, command submission, and completion UI
|     \- ...                    # Shared state, theme, description parsing, and UI utilities
|- tests/                       # Backend TypeScript Vitest suites
|  \- frontend/                # Browser JavaScript suites using happy-dom
|- dev-data/dummy.ini           # Fallback INI for the generated development instance
|- docs/                        # Historical V1/V2 plans and the newer V2.1 specification
|- servers-config.json.example  # Multi-instance configuration example
|- fake-start-server.sh         # Manual server-process simulator
|- start-panel.ps1              # Windows startup script with optional host/port
|- start-panel.sh               # Linux/macOS startup script with optional host/port
|- tsconfig.json                # Strict backend build; includes only src/**/*.ts
\- vitest.config.ts            # Default Node test environment
```

## Development Guide

### Commands

```bash
# Install dependencies
npm install

# Run directly from TypeScript
npm run dev

# Build src/**/*.ts into dist/
npm run build

# Run the built server (build first)
npm start
npm start -- --host 127.0.0.1 --port 3000

# Build when needed and start through the provided scripts
.\start-panel.ps1
./start-panel.sh --host 0.0.0.0 --port 8080

# Run tests once, or run one file/name pattern
npm test -- run
npm test -- run tests/runtime-manager.test.ts
npm test -- run -t "<pattern>"

# Type-check backend source without emitting
npx tsc --noEmit
```

`npm test` starts Vitest in watch mode. TypeScript build/type-check commands do not cover `tests/**/*.ts` or `public/**/*.js`; run the tests for those changes.

### Workflows

- Configuration bootstrap: `servers-config.json` is the primary config. If absent, startup can migrate legacy `paths-config.json`, use `--config` as an INI migration candidate, or create a development instance using `dev-data/dummy.ini`. Old flat `servers-config.json` data is also migrated.
- Frontend navigation: `/` redirects to `instance-select.html`; selecting an instance opens `index.html?serverId=<id>`. The management page requires that ID for instance-specific API calls.
- INI updates: read and write through `/api/config?serverId=<id>`. Writes acquire `<ini>.lock`, create `<ini>.bak`, preserve supported UTF-8 BOM/newline style, then serialize normalized content.
- Runtime control: one `ServerRuntimeManager` permits only one instance in `starting`, `running`, or `stopping`. Stop commands are sent before escalating to process termination after the configured timeout.
- Terminal: SSE first replays the instance ring buffer and then streams output; submitted non-empty command lines are written to the managed process stdin.
- Route errors: expected failures use `AppError` and `{ error: { code, message } }`; unexpected failures return `INTERNAL_ERROR` with status 500.

## Notes

### Architecture And Safety

- The backend defaults to `127.0.0.1`, has no authentication, and is intended for access through an SSH tunnel. `--host` can change the bind address, but binding to a non-loopback address exposes the panel to the network and must be protected by the operator.
- `servers-config.json` is resolved from the process working directory. `--config <path>` is only a legacy migration fallback; it does not relocate the primary config. `--host` defaults to `127.0.0.1` and `--port` defaults to 3000. Invalid or unknown CLI arguments print usage and exit 1.
- Every instance owns an absolute `.ini` path. Use absolute paths for production Workshop and start-script configuration as well. Runtime state and logs exist only in memory, so a panel restart does not rediscover or take ownership of an existing PZ process.
- INI saving rebuilds parsed content: comments, blank lines, unknown lines, and original key order are not retained. Only strict UTF-8 and UTF-8 BOM are supported; `Mods` and `WorkshopItems` lists are normalized.
- Workshop media requests must remain inside the configured Workshop root. Keep path checks compatible with POSIX paths, Windows backslashes, and drive letters.
- Workshop directory deletion must validate the item id, resolve it inside the configured Workshop root, reject symlinks/non-directories, and remove only the item directory. File deletion happens before config mutation; on failure, leave config unchanged.
- Process termination uses process groups on Linux/macOS and `taskkill` on Windows. Preserve cross-platform behavior when changing runtime code.
- Scheduled commands live per instance in `servers-config.json` as `scheduledCommands` entries (`start`, `stop`, `force-stop`, `restart`). Cron uses five fields in the panel process's local time, matches once per minute, and only runs while the panel is running.

### API Boundaries

- Config: `GET/PUT /api/config?serverId=<id>`, `GET /api/workshop-poster?rel=<path>`, `DELETE /api/workshop-items/:itemId`
- Instances: `GET/PUT /api/servers-config`, `GET/PUT /api/global-config`, and CRUD under `/api/servers`
- Runtime: `GET /api/servers/runtime`, `POST /api/servers/:id/start`, `POST /api/servers/:id/stop`, `POST /api/servers/:id/force-stop`, `POST /api/servers/:id/restart`
- Terminal: `GET /api/servers/:id/terminal/stream`, `POST /api/servers/:id/terminal/commands`, `GET /api/terminal/commands?prefix=<text>`
- Compatibility: `/api/paths` exists only for legacy clients and migration support.

### Code And Tests

- Backend style: 2 spaces, semicolons, double quotes, trailing commas, PascalCase types, camelCase values, UPPER_SNAKE_CASE constants, and `_`-prefixed unused parameters.
- Use `node:` for built-ins and `.js` extensions for new local TypeScript imports. Prefer guard clauses, early returns, and arrow callbacks. There is no ESLint or Prettier command.
- Keep the frontend as direct browser ES modules unless an explicit build-system change is requested. Preserve existing module responsibilities rather than growing `app.js`.
- Vitest defaults to Node; frontend files opt into `happy-dom` with a file-level environment annotation. Cover success and error paths, and clean temporary filesystem fixtures in `afterEach`.
- `parseModInfo()` filters self-references from `require`, `loadModBefore`, `loadModAfter`, and `incompatible`; keep that invariant when changing Workshop parsing.
