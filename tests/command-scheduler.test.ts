import { describe, it, expect, vi } from "vitest";
import { CommandScheduler } from "../src/scheduler/command-scheduler.js";
import type { ServerRuntimeManager } from "../src/runtime/manager.js";
import type {
  ScheduledAction,
  ScheduledCommand,
  ServerInstance,
  ServersConfig,
} from "../src/types/server.js";

function createServer(scheduledCommands: ScheduledCommand[]): ServerInstance {
  return {
    id: "main",
    name: "Main",
    iniPath: "/srv/main.ini",
    savePath: "/srv/saves/main",
    startArgs: ["-servername", "main"],
    stopCommands: ["save", "quit"],
    scheduledCommands,
  };
}

function createConfig(commands: ScheduledCommand[]): ServersConfig {
  return {
    global: {
      workshopPath: "",
      startScriptPath: "/start.sh",
      stopGraceTimeoutMs: 45000,
      forceKillTimeoutMs: 10000,
    },
    servers: [createServer(commands)],
  };
}

function createCommand(
  action: ScheduledAction,
  overrides: Partial<ScheduledCommand> = {},
): ScheduledCommand {
  return {
    id: action,
    name: action,
    action,
    cron: "0 4 * * *",
    enabled: true,
    ...overrides,
  };
}

function createRuntimeManager() {
  return {
    startServer: vi.fn().mockResolvedValue({}),
    stopServer: vi.fn().mockResolvedValue({}),
    forceStopServer: vi.fn().mockResolvedValue({}),
    restartServer: vi.fn().mockResolvedValue({}),
  } as unknown as ServerRuntimeManager & {
    startServer: ReturnType<typeof vi.fn>;
    stopServer: ReturnType<typeof vi.fn>;
    forceStopServer: ReturnType<typeof vi.fn>;
    restartServer: ReturnType<typeof vi.fn>;
  };
}

describe("CommandScheduler", () => {
  it("dispatches all four control actions when their cron matches", async () => {
    const runtimeManager = createRuntimeManager();
    const config = createConfig([
      createCommand("start"),
      createCommand("stop"),
      createCommand("force-stop"),
      createCommand("restart"),
    ]);
    const scheduler = new CommandScheduler({
      runtimeManager,
      loadConfig: async () => config,
    });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0));

    const server = config.servers[0];
    expect(runtimeManager.startServer).toHaveBeenCalledWith(server, config.global);
    expect(runtimeManager.stopServer).toHaveBeenCalledWith(server, {
      stopGraceTimeoutMs: 45000,
      forceKillTimeoutMs: 10000,
    });
    expect(runtimeManager.forceStopServer).toHaveBeenCalledWith(server, 10000);
    expect(runtimeManager.restartServer).toHaveBeenCalledWith(server, config.global, {
      stopGraceTimeoutMs: 45000,
      forceKillTimeoutMs: 10000,
    });
  });

  it("dispatches a backup action through the backup handler", async () => {
    const runtimeManager = createRuntimeManager();
    const createBackup = vi.fn().mockResolvedValue({});
    const config = createConfig([createCommand("backup")]);
    const scheduler = new CommandScheduler({
      runtimeManager,
      loadConfig: async () => config,
      createBackup,
    });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0));

    expect(createBackup).toHaveBeenCalledWith(config.servers[0]);
    expect(runtimeManager.startServer).not.toHaveBeenCalled();
    expect(runtimeManager.stopServer).not.toHaveBeenCalled();
  });

  it("skips disabled commands and non-matching schedules", async () => {
    const runtimeManager = createRuntimeManager();
    const scheduler = new CommandScheduler({
      runtimeManager,
      loadConfig: async () => createConfig([
        createCommand("start", { id: "disabled", enabled: false }),
        createCommand("stop", { id: "other-time", cron: "0 5 * * *" }),
      ]),
    });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0));

    expect(runtimeManager.startServer).not.toHaveBeenCalled();
    expect(runtimeManager.stopServer).not.toHaveBeenCalled();
  });

  it("runs a matching command only once per minute", async () => {
    const runtimeManager = createRuntimeManager();
    const scheduler = new CommandScheduler({
      runtimeManager,
      loadConfig: async () => createConfig([
        createCommand("start", { cron: "* * * * *" }),
      ]),
    });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0, 5));
    await scheduler.tick(new Date(2026, 9, 18, 4, 0, 35));

    expect(runtimeManager.startServer).toHaveBeenCalledTimes(1);

    await scheduler.tick(new Date(2026, 9, 18, 4, 1));

    expect(runtimeManager.startServer).toHaveBeenCalledTimes(2);
  });

  it("continues with other commands when one action fails", async () => {
    const runtimeManager = createRuntimeManager();
    runtimeManager.startServer.mockRejectedValue(new Error("already running"));
    const errors: string[] = [];
    const scheduler = new CommandScheduler({
      runtimeManager,
      loadConfig: async () => createConfig([
        createCommand("start"),
        createCommand("stop"),
      ]),
      onError: (_error, context) => errors.push(context),
    });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0));

    expect(runtimeManager.stopServer).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["main/start"]);
  });

  it("reloads the config on every tick", async () => {
    const runtimeManager = createRuntimeManager();
    const loadConfig = vi
      .fn()
      .mockResolvedValueOnce(createConfig([]))
      .mockResolvedValueOnce(createConfig([
        createCommand("start", { cron: "* * * * *" }),
      ]));
    const scheduler = new CommandScheduler({ runtimeManager, loadConfig });

    await scheduler.tick(new Date(2026, 9, 18, 4, 0));
    await scheduler.tick(new Date(2026, 9, 18, 4, 1));

    expect(loadConfig).toHaveBeenCalledTimes(2);
    expect(runtimeManager.startServer).toHaveBeenCalledTimes(1);
  });
});
