import {
  spawn,
  execSync,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import type { Writable } from "node:stream";
import { AppError } from "../errors/app-error.js";
import type {
  ServerInstance,
  ServerLastExit,
  ServerRuntimeState,
  ServerRuntimeStatus,
  ServersRuntimeSnapshot,
  TerminalLine,
  ServerGlobalConfig,
} from "../types/server.js";
import { TerminalRingBuffer } from "./terminal-buffer.js";
import { buildStartCommand } from "../config/servers-config.js";

type RuntimeRecord = {
  state: ServerRuntimeState;
  process: ChildProcessWithoutNullStreams | null;
  terminalBuffer: TerminalRingBuffer;
  listeners: Set<(line: TerminalLine) => void>;
};

type SpawnProcess = (
  command: string,
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

type TimerHandle = ReturnType<typeof setTimeout>;

export type StopServerOptions = {
  stopGraceTimeoutMs: number;
  forceKillTimeoutMs: number;
};

export type ServerRuntimeManagerOptions = {
  startupProbeMs?: number;
  spawnProcess?: SpawnProcess;
  now?: () => Date;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => TimerHandle;
  clearTimeoutFn?: (handle: TimerHandle) => void;
};

const ACTIVE_STATUSES: ServerRuntimeStatus[] = ["starting", "running", "stopping"];
const DEFAULT_STARTUP_PROBE_MS = 300;

function isActiveStatus(status: ServerRuntimeStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function cloneLastExit(lastExit: ServerLastExit | null): ServerLastExit | null {
  if (!lastExit) {
    return null;
  }

  return { ...lastExit };
}

function cloneState(state: ServerRuntimeState): ServerRuntimeState {
  return {
    serverId: state.serverId,
    status: state.status,
    pid: state.pid,
    startedAt: state.startedAt,
    lastExit: cloneLastExit(state.lastExit),
  };
}

function createDefaultState(serverId: string): ServerRuntimeState {
  return {
    serverId,
    status: "stopped",
    pid: null,
    startedAt: null,
    lastExit: null,
  };
}

function defaultSpawnProcess(
  command: string,
  options: SpawnOptionsWithoutStdio,
): ChildProcessWithoutNullStreams {
  return spawn(command, options) as ChildProcessWithoutNullStreams;
}

export class ServerRuntimeManager {
  private readonly records = new Map<string, RuntimeRecord>();

  private activeServerId: string | null = null;

  private readonly startupProbeMs: number;

  private readonly spawnProcess: SpawnProcess;

  private readonly now: () => Date;

  private readonly setTimeoutFn: (handler: () => void, timeoutMs: number) => TimerHandle;

  private readonly clearTimeoutFn: (handle: TimerHandle) => void;

  public constructor(options: ServerRuntimeManagerOptions = {}) {
    this.startupProbeMs = options.startupProbeMs ?? DEFAULT_STARTUP_PROBE_MS;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
    this.now = options.now ?? (() => new Date());
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  }

  public getRuntimeSnapshot(servers: ServerInstance[]): ServersRuntimeSnapshot {
    const serverStates = servers.map((server) => {
      const record = this.ensureRecord(server.id);
      return cloneState(record.state);
    });

    if (this.activeServerId) {
      const activeRecord = this.records.get(this.activeServerId);
      if (!activeRecord || !isActiveStatus(activeRecord.state.status)) {
        this.activeServerId = null;
      }
    }

    return {
      activeServerId: this.activeServerId,
      servers: serverStates,
    };
  }

  public async startServer(
    server: ServerInstance,
    globalConfig: ServerGlobalConfig,
  ): Promise<ServerRuntimeState> {
    const record = this.ensureRecord(server.id);

    if (isActiveStatus(record.state.status)) {
      throw new AppError("SERVER_ALREADY_RUNNING", `Server is already active: ${server.id}`);
    }

    this.ensureNoAnotherServerActive(server.id);

    record.state.status = "starting";
    record.state.pid = null;
    record.state.startedAt = null;
    this.activeServerId = server.id;

    const startCommand = buildStartCommand(globalConfig, server);

    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnProcess(startCommand, {
        shell: true,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      this.markStartFailed(server.id);
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError("PROCESS_SPAWN_FAILED", `Failed to start server: ${message}`);
    }

    record.process = child;
    record.state.pid = child.pid ?? null;
    record.state.startedAt = this.now().toISOString();
    this.attachProcessListeners(server.id, child);

    try {
      await this.waitForStartup(child);
    } catch (error) {
      this.markStartFailed(server.id);
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError("PROCESS_SPAWN_FAILED", `Failed to start server: ${message}`);
    }

    if (record.state.status === "starting") {
      record.state.status = "running";
    }

    return cloneState(record.state);
  }

  public async stopServer(
    server: ServerInstance,
    options: StopServerOptions,
  ): Promise<ServerRuntimeState> {
    const record = this.ensureRecord(server.id);
    if (record.state.status !== "running") {
      throw new AppError("SERVER_NOT_RUNNING", `Server is not running: ${server.id}`);
    }

    const child = record.process;
    if (!child) {
      record.state.status = "stopped";
      throw new AppError("SERVER_NOT_RUNNING", `Server is not running: ${server.id}`);
    }

    record.state.status = "stopping";
    await this.sendStopCommands(child, server.stopCommands);

    let exited = await this.waitForExit(child, options.stopGraceTimeoutMs);
    if (!exited) {
      this.killProcess(record, "SIGTERM");
      exited = await this.waitForExit(child, options.forceKillTimeoutMs);
    }

    if (!exited) {
      this.killProcess(record, "SIGKILL");
      exited = await this.waitForExit(child, options.forceKillTimeoutMs);
    }

    if (!exited) {
      record.state.status = "error";
      record.state.pid = null;
      record.state.startedAt = null;
      record.state.lastExit = {
        code: null,
        signal: null,
        at: this.now().toISOString(),
      };
      if (this.activeServerId === server.id) {
        this.activeServerId = null;
      }
      throw new AppError("STOP_TIMEOUT", `Timed out stopping server: ${server.id}`);
    }

    return cloneState(record.state);
  }

  private ensureRecord(serverId: string): RuntimeRecord {
    const existing = this.records.get(serverId);
    if (existing) {
      return existing;
    }

    const created: RuntimeRecord = {
      state: createDefaultState(serverId),
      process: null,
      terminalBuffer: new TerminalRingBuffer(),
      listeners: new Set(),
    };
    this.records.set(serverId, created);
    return created;
  }

  private ensureNoAnotherServerActive(targetServerId: string): void {
    for (const [serverId, record] of this.records.entries()) {
      if (serverId === targetServerId) {
        continue;
      }

      if (isActiveStatus(record.state.status)) {
        throw new AppError(
          "ANOTHER_SERVER_RUNNING",
          `Another server is active: ${serverId}`,
        );
      }
    }
  }

  private attachProcessListeners(
    serverId: string,
    child: ChildProcessWithoutNullStreams,
  ): void {
    const record = this.ensureRecord(serverId);

    child.stdout.on("data", (data: Buffer) => {
      const lines = data.toString("utf-8").split(/\r?\n/);
      for (const line of lines) {
        if (line || lines.indexOf(line) < lines.length - 1) {
          const terminalLine: TerminalLine = {
            timestamp: this.now().toISOString(),
            stream: "stdout",
            text: line,
          };
          record.terminalBuffer.append(terminalLine);
          this.notifyListeners(record, terminalLine);
        }
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      const lines = data.toString("utf-8").split(/\r?\n/);
      for (const line of lines) {
        if (line || lines.indexOf(line) < lines.length - 1) {
          const terminalLine: TerminalLine = {
            timestamp: this.now().toISOString(),
            stream: "stderr",
            text: line,
          };
          record.terminalBuffer.append(terminalLine);
          this.notifyListeners(record, terminalLine);
        }
      }
    });

    child.once("error", (error: Error) => {
      if (record.process !== child) {
        return;
      }

      const systemLine: TerminalLine = {
        timestamp: this.now().toISOString(),
        stream: "system",
        text: `Process error: ${error.message}`,
      };
      record.terminalBuffer.append(systemLine);
      this.notifyListeners(record, systemLine);

      record.process = null;
      record.state.status = "error";
      record.state.pid = null;
      record.state.startedAt = null;
      record.state.lastExit = {
        code: null,
        signal: null,
        at: this.now().toISOString(),
      };
      if (this.activeServerId === serverId) {
        this.activeServerId = null;
      }
    });

    child.once("exit", (code, signal) => {
      if (record.process !== child) {
        return;
      }

      const systemLine: TerminalLine = {
        timestamp: this.now().toISOString(),
        stream: "system",
        text: `Process exited with code=${code}, signal=${signal}`,
      };
      record.terminalBuffer.append(systemLine);
      this.notifyListeners(record, systemLine);

      record.process = null;
      record.state.pid = null;
      record.state.startedAt = null;
      record.state.lastExit = {
        code,
        signal,
        at: this.now().toISOString(),
      };

      if (record.state.status !== "error") {
        record.state.status = "stopped";
      }

      if (this.activeServerId === serverId) {
        this.activeServerId = null;
      }
    });
  }

  private notifyListeners(record: RuntimeRecord, line: TerminalLine): void {
    for (const listener of record.listeners) {
      try {
        listener(line);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private waitForStartup(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (this.startupProbeMs <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = this.setTimeoutFn(() => {
        cleanup();
        settled = true;
        resolve();
      }, this.startupProbeMs);

      const onError = (error: Error) => {
        if (settled) {
          return;
        }
        cleanup();
        settled = true;
        reject(error);
      };

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) {
          return;
        }
        cleanup();
        settled = true;
        reject(new Error(`Process exited early (code=${code}, signal=${signal})`));
      };

      const cleanup = () => {
        child.off("error", onError);
        child.off("exit", onExit);
        this.clearTimeoutFn(timer);
      };

      child.once("error", onError);
      child.once("exit", onExit);
    });
  }

  private waitForExit(
    child: ChildProcessWithoutNullStreams,
    timeoutMs: number,
  ): Promise<boolean> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const onExit = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(true);
      };

      const timer = this.setTimeoutFn(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(false);
      }, timeoutMs);

      const cleanup = () => {
        child.off("exit", onExit);
        this.clearTimeoutFn(timer);
      };

      child.once("exit", onExit);
    });
  }

  private killProcess(record: RuntimeRecord, signal: NodeJS.Signals): void {
    const child = record.process;
    if (!child || child.pid === undefined) {
      return;
    }

    const pid = child.pid;

    if (process.platform === "win32") {
      try {
        const force = signal === "SIGKILL" ? " /F" : "";
        execSync(`taskkill /PID ${pid} /T${force}`, { windowsHide: true });
        return;
      } catch {
        // no-op
      }
    }

    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // no-op, fallback to direct child signal below
    }

    try {
      child.kill(signal);
    } catch {
      // no-op
    }
  }

  private markStartFailed(serverId: string): void {
    const record = this.ensureRecord(serverId);
    record.process = null;
    record.state.status = "error";
    record.state.pid = null;
    record.state.startedAt = null;
    if (!record.state.lastExit) {
      record.state.lastExit = {
        code: null,
        signal: null,
        at: this.now().toISOString(),
      };
    }
    if (this.activeServerId === serverId) {
      this.activeServerId = null;
    }
  }

  private async sendStopCommands(
    child: ChildProcessWithoutNullStreams,
    commands: string[],
  ): Promise<void> {
    if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
      return;
    }

    for (const command of commands) {
      const normalized = command.trim();
      if (!normalized) {
        continue;
      }

      try {
        await this.writeToStdin(child.stdin, `${normalized}\n`);
      } catch {
        return;
      }
    }
  }

  private writeToStdin(stream: Writable, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.write(text, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  public subscribeTerminal(
    serverId: string,
    listener: (line: TerminalLine) => void,
  ): TerminalLine[] {
    const record = this.ensureRecord(serverId);
    record.listeners.add(listener);
    return record.terminalBuffer.getSnapshot();
  }

  public unsubscribeTerminal(
    serverId: string,
    listener: (line: TerminalLine) => void,
  ): void {
    const record = this.records.get(serverId);
    if (record) {
      record.listeners.delete(listener);
    }
  }

  public getTerminalHistory(serverId: string): TerminalLine[] {
    const record = this.ensureRecord(serverId);
    return record.terminalBuffer.getSnapshot();
  }

  public async sendCommands(
    serverId: string,
    text: string,
  ): Promise<{ successCount: number; errors: Array<{ line: number; reason: string }> }> {
    const record = this.ensureRecord(serverId);

    if (record.state.status !== "running") {
      throw new AppError("SERVER_NOT_RUNNING", `Server is not running: ${serverId}`);
    }

    const child = record.process;
    if (!child || !child.stdin || child.stdin.destroyed || !child.stdin.writable) {
      throw new AppError("TERMINAL_NOT_WRITABLE", `Terminal is not writable: ${serverId}`);
    }

    const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    const errors: Array<{ line: number; reason: string }> = [];
    let successCount = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const command = lines[i];
      if (!command) {
        continue;
      }

      try {
        await this.writeToStdin(child.stdin, `${command}\n`);

        const systemLine: TerminalLine = {
          timestamp: this.now().toISOString(),
          stream: "system",
          text: `> ${command}`,
        };
        record.terminalBuffer.append(systemLine);
        this.notifyListeners(record, systemLine);

        successCount += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push({ line: i + 1, reason });
      }
    }

    return { successCount, errors };
  }
}
