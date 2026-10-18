import express from "express";
import {
  createHealthRouter,
  createConfigRouter,
  createServersConfigRouter,
  createServersRuntimeRouter,
  createTerminalRouter,
  createTerminalCommandsRouter,
  createBackupsRouter,
} from "./routes/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { ServerRuntimeManager } from "./runtime/manager.js";
import { loadServersConfig } from "./config/servers-config.js";
import { CommandScheduler } from "./scheduler/command-scheduler.js";
import {
  formatListenUrl,
  isLoopbackHost,
  parseStartupOptions,
  type StartupOptions,
} from "./cli-options.js";

function usage(): string {
  return "Usage: node dist/server.js [--host <address>] [--port <number>] [--config <path>]";
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
app.use("/api", createBackupsRouter(startupOptions.configPath || ""));

app.use(errorHandler);

(async () => {
  await loadServersConfig({ cliConfigPath: startupOptions.configPath || "" });

  const commandScheduler = new CommandScheduler({
    runtimeManager,
    cliConfigPath: startupOptions.configPath || "",
  });
  commandScheduler.start();

  const listenUrl = formatListenUrl(startupOptions.host, startupOptions.port);

  if (!isLoopbackHost(startupOptions.host)) {
    console.warn(
      "Warning: the panel has no authentication. Binding to a non-loopback address exposes it to the network.",
    );
  }

  const httpServer = app.listen(startupOptions.port, startupOptions.host, () => {
    if (startupOptions.configPath) {
      console.log(`Config file: ${startupOptions.configPath}`);
    }
    console.log(`pzserver-config-panel listening on ${listenUrl}`);
  });

  httpServer.on("error", (error) => {
    console.error("Failed to start HTTP server:", error);
    process.exit(1);
  });
})().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
