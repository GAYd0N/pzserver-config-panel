import { createHealthRouter } from "./health.js";
import { createConfigRouter } from "./config.js";
import { createServersConfigRouter } from "./servers-config.js";
import { createServersRuntimeRouter } from "./servers-runtime.js";
import { createTerminalRouter } from "./terminal.js";
import { createTerminalCommandsRouter } from "./terminal-commands.js";
import { createBackupsRouter } from "./backups.js";

export {
  createHealthRouter,
  createConfigRouter,
  createServersConfigRouter,
  createServersRuntimeRouter,
  createTerminalRouter,
  createTerminalCommandsRouter,
  createBackupsRouter,
};
