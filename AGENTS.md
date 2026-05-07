# Agent Configuration

## Environment

- Node.js >= 18
- Cross-platform: Linux, macOS, Windows (Windows uses `taskkill` for process termination; path handling handles backslashes and drive letters)

## Key Architecture Facts

- **V2 multi-instance**: server instances are defined in `servers-config.json` (not `paths-config.json`). The legacy `paths-config.json` is auto-migrated on first boot.
- **Per-server INI path**: each instance has its own `iniPath` in `servers-config.json`. There is no single global config file.
- **Single-active runtime**: only one server instance can be `starting`/`running`/`stopping` at a time.
- **Frontend flow**: users first land on `instance-select.html` → pick a server → redirect to `index.html?serverId=<id>` via `instance-select.js`.
- Backend listens on `127.0.0.1` only. Access is intended via SSH tunnel; no authentication.
- Static frontend files served from `public/`.

## Build/Run/Test Commands

```bash
npm install                    # must run before build/dev
npm run build                  # tsc -p tsconfig.json → dist/
npm start                      # node dist/server.js
npm start -- --port 3000       # with custom port
npm run dev                    # tsx src/server.ts (no build needed)
npm test                       # vitest (watch mode by default)
npm test -- run                # run once, no watch
npm test -- tests/<file>       # run specific test file
npm test -- -t "<pattern>"     # filter by test name
npx tsc --noEmit               # type-check without emitting
```

## Config Files (gitignored)

| File | Purpose |
|------|---------|
| `servers-config.json` | V2 multi-instance config (primary) |
| `paths-config.json` | Legacy V1.5 config (migrated on first boot) |

## CLI Arguments (`src/server.ts`)

- `--config <path>` — used only for legacy migration fallback, not the primary config
- `--port <number>` — default 3000
- Unknown arguments or missing options cause usage print + exit 1

## Module Layout

| Directory | Purpose |
|-----------|---------|
| `src/server.ts` | Entry point, CLI parsing, Express setup |
| `src/routes/` | `health`, `config` (INI + workshop-poster), `servers-config`, `servers-runtime`, `terminal`, `terminal-commands` |
| `src/config/` | `workshop-parser.ts` (mod.info), `servers-config.ts` (multi-instance CRUD), ini parser/serializer, encoding, lock, backup |
| `src/runtime/` | `manager.ts` (spawn/kill/terminal), `terminal-buffer.ts` (ring buffer) |
| `src/types/` | `config.ts` (SubMod, WorkshopItem, ConfigItem), `server.ts` (ServerInstance, RuntimeState, TerminalLine) |
| `src/errors/` | `AppError` class with typed error codes |
| `src/middleware/` | Express error handler |
| `src/rules/` | zh-CN labels for PZ config keys and admin commands |
| `public/` | `index.html`, `instance-select.html`, `app.js`, `instance-select.js`, `style.css` |
| `tests/` | Vitest *.test.ts files |

## Key APIs

### Config
- `GET /api/config?serverId=<id>` — returns INI items + workshopItems
- `PUT /api/config?serverId=<id>` — save INI items
- `GET /api/workshop-poster?rel=<path>` — serve poster/icon files from workshop dir

### Servers (V2)
- `GET/PUT /api/servers-config` — multi-instance config CRUD
- `GET /api/servers/runtime` — all instances runtime status
- `POST /api/servers/:id/start`, `POST /api/servers/:id/stop`

### Terminal
- `GET /api/servers/:id/terminal/stream` — SSE log stream
- `POST /api/servers/:id/terminal/commands` — send commands to stdin
- `GET /api/terminal/commands?prefix=<text>` — autocomplete suggestions

## mod.info Fields Parsed

Parsed in `src/config/workshop-parser.ts` → `parseModInfo()` → returns `SubMod`:
`name`, `id`, `description`, `poster`, `icon`, `require`, `category`, `loadModBefore`, `loadModAfter`, `incompatible`, `author`, `url`, `modversion`, `pack`, `tiledef`, `versionMin`, `versionMax`.

Self-referencing IDs in `require`/`loadModBefore`/`loadModAfter`/`incompatible` are automatically filtered out.

## Error Handling (`src/errors/app-error.ts`)

Error codes: `BAD_REQUEST`, `NOT_FOUND`, `FILE_LOCKED`, `IO_ERROR`, `ENCODING_UNSUPPORTED`, `SERVER_ALREADY_RUNNING`, `SERVER_NOT_RUNNING`, `ANOTHER_SERVER_RUNNING`, `TERMINAL_NOT_WRITABLE`, `PROCESS_SPAWN_FAILED`, `STOP_TIMEOUT`.

```typescript
throw new AppError("BAD_REQUEST", "message");
// Returns: { error: { code: "BAD_REQUEST", message: "..." } } with status 400
```

Catch `AppError` via `toErrorResponse()` in route handlers. Unexpected errors return `{ error: { code: "INTERNAL_ERROR", message } }` with 500.

## Code Style

- 2 spaces, semicolons, double quotes, trailing commas
- `import { x } from "./bar.js"` (`.js` extension for local, no extension for npm, `node:` prefix for builtins)
- `type` aliases for simple types, `interface` for object shapes with methods
- PascalCase types/enums, camelCase functions/vars, UPPER_SNAKE_CASE constants
- Prefix unused parameters: `_req`, `_next`
- Arrow functions for callbacks, early returns, guard clauses
- No comments unless clarifying non-obvious behavior
- No Prettier/eslint

## Testing Conventions

- Vitest with `environment: "node"` (in `vitest.config.ts`)
- `describe`/`it`/`beforeEach`/`afterEach` pattern
- Arrange → Act → Assert
- Test both success and error paths
- Use `npx vitest run` for CI-style runs (no watch)
