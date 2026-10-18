import { loadServersConfig } from "../config/servers-config.js";
import type { ServerRuntimeManager, StopServerOptions } from "../runtime/manager.js";
import type {
  ScheduledCommand,
  ServerInstance,
  ServersConfig,
} from "../types/server.js";
import {
  matchesCronExpression,
  parseCronExpression,
  type CronSchedule,
} from "./cron.js";

export type CommandSchedulerOptions = {
  runtimeManager: ServerRuntimeManager;
  cliConfigPath?: string;
  intervalMs?: number;
  now?: () => Date;
  loadConfig?: () => Promise<ServersConfig>;
  onError?: (error: unknown, context: string) => void;
  setIntervalFn?: (handler: () => void, intervalMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
};

const DEFAULT_INTERVAL_MS = 20_000;

function toMinuteKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class CommandScheduler {
  private readonly runtimeManager: ServerRuntimeManager;

  private readonly intervalMs: number;

  private readonly now: () => Date;

  private readonly loadConfig: () => Promise<ServersConfig>;

  private readonly onError: (error: unknown, context: string) => void;

  private readonly setIntervalFn: (
    handler: () => void,
    intervalMs: number,
  ) => ReturnType<typeof setInterval>;

  private readonly clearIntervalFn: (handle: ReturnType<typeof setInterval>) => void;

  private readonly lastRunMinutes = new Map<string, string>();

  private readonly scheduleCache = new Map<string, CronSchedule>();

  private timer: ReturnType<typeof setInterval> | null = null;

  private ticking = false;

  public constructor(options: CommandSchedulerOptions) {
    this.runtimeManager = options.runtimeManager;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.now = options.now ?? (() => new Date());
    this.loadConfig =
      options.loadConfig ??
      (() => loadServersConfig({ cliConfigPath: options.cliConfigPath }));
    this.onError =
      options.onError ??
      ((error, context) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[scheduler] ${context}: ${message}`);
      });
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  public start(): void {
    if (this.timer) {
      return;
    }

    this.timer = this.setIntervalFn(() => {
      void this.tick();
    }, this.intervalMs);

    if (typeof this.timer === "object" && this.timer !== null && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    this.clearIntervalFn(this.timer);
    this.timer = null;
  }

  public async tick(now: Date = this.now()): Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      const config = await this.loadConfig();
      const minuteKey = toMinuteKey(now);

      for (const server of config.servers) {
        for (const command of server.scheduledCommands) {
          if (!command.enabled) {
            continue;
          }

          const schedule = this.getSchedule(command.cron);
          if (!schedule || !matchesCronExpression(schedule, now)) {
            continue;
          }

          const runKey = `${server.id}:${command.id}`;
          if (this.lastRunMinutes.get(runKey) === minuteKey) {
            continue;
          }
          this.lastRunMinutes.set(runKey, minuteKey);

          try {
            await this.execute(config, server, command);
          } catch (error) {
            this.onError(error, `${server.id}/${command.id}`);
          }
        }
      }

      this.pruneLastRuns(config);
    } catch (error) {
      this.onError(error, "tick");
    } finally {
      this.ticking = false;
    }
  }

  private getSchedule(cron: string): CronSchedule | null {
    const cached = this.scheduleCache.get(cron);
    if (cached) {
      return cached;
    }

    try {
      const schedule = parseCronExpression(cron);
      this.scheduleCache.set(cron, schedule);
      return schedule;
    } catch (error) {
      this.onError(error, `cron/${cron}`);
      return null;
    }
  }

  private async execute(
    config: ServersConfig,
    server: ServerInstance,
    command: ScheduledCommand,
  ): Promise<void> {
    const stopOptions: StopServerOptions = {
      stopGraceTimeoutMs: config.global.stopGraceTimeoutMs,
      forceKillTimeoutMs: config.global.forceKillTimeoutMs,
    };

    switch (command.action) {
      case "start":
        await this.runtimeManager.startServer(server, config.global);
        break;
      case "stop":
        await this.runtimeManager.stopServer(server, stopOptions);
        break;
      case "force-stop":
        await this.runtimeManager.forceStopServer(
          server,
          config.global.forceKillTimeoutMs,
        );
        break;
      case "restart":
        await this.runtimeManager.restartServer(server, config.global, stopOptions);
        break;
    }
  }

  private pruneLastRuns(config: ServersConfig): void {
    const validKeys = new Set<string>();
    for (const server of config.servers) {
      for (const command of server.scheduledCommands) {
        validKeys.add(`${server.id}:${command.id}`);
      }
    }

    for (const key of this.lastRunMinutes.keys()) {
      if (!validKeys.has(key)) {
        this.lastRunMinutes.delete(key);
      }
    }
  }
}
