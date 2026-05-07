import express from "express";
import {
  createHealthRouter,
  createConfigRouter,
  createServersConfigRouter,
  createServersRuntimeRouter,
  createTerminalRouter,
  createTerminalCommandsRouter,
} from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { ServerRuntimeManager } from "./runtime/manager.js";
import { loadServersConfig } from "./config/servers-config.js";

type StartupOptions = {
  configPath?: string;
  port: number;
};

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function usage(): string {
  return "Usage: node dist/server.js [--config <path>] [--port <number>]";
}

function parsePort(rawPort: string): number {
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("Invalid --port: must be an integer.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid --port: must be between 1 and 65535.");
  }

  return port;
}

function parseStartupOptions(argv: string[]): StartupOptions {
  let configPath: string | undefined;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --config.");
      }

      configPath = value;
      i += 1;
      continue;
    }

    if (arg === "--port") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --port.");
      }

      port = parsePort(value);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { configPath, port };
}

let startupOptions: StartupOptions;
try {
  startupOptions = parseStartupOptions(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Argument error: ${message}`);
  console.error(usage());
  process.exit(1);
}

const app = express();
const runtimeManager = new ServerRuntimeManager();

// 根路径重定向到实例选择页面
app.get("/", (_req, res) => {
  res.redirect("/instance-select.html");
});

app.use(express.static("public"));
app.use(express.json());

app.use("/api", createHealthRouter());
app.use("/api", createConfigRouter(startupOptions.configPath || ""));
app.use(
  "/api",
  createServersRuntimeRouter(runtimeManager, startupOptions.configPath || ""),
);
app.use("/api", createServersConfigRouter(startupOptions.configPath || ""));
app.use(
  "/api",
  createTerminalRouter(runtimeManager, startupOptions.configPath || ""),
);
app.use("/api", createTerminalCommandsRouter());

app.use(errorHandler);

(async () => {
  await loadServersConfig({ cliConfigPath: startupOptions.configPath || "" });

  app.listen(startupOptions.port, HOST, () => {
    if (startupOptions.configPath) {
      console.log(`Config file: ${startupOptions.configPath}`);
    }
    console.log(
      `pzserver-config-panel listening on http://${HOST}:${startupOptions.port}`,
    );
  });
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
