import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { ServerRuntimeManager } from "../src/runtime/manager.js";
import type { ServerInstance, ServerGlobalConfig } from "../src/types/server.js";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

const STOP_OPTIONS = {
  stopGraceTimeoutMs: 100,
  forceKillTimeoutMs: 500,
};

const DEFAULT_GLOBAL_CONFIG: ServerGlobalConfig = {
  workshopPath: "/workshop",
  startScriptPath: "node",
  stopGraceTimeoutMs: 100,
  forceKillTimeoutMs: 500,
};

function createServer(overrides: Partial<ServerInstance>): ServerInstance {
  return {
    id: "server",
    name: "server",
    iniPath: "/tmp/server.ini",
    startArgs: ["-e", "console.log('hello')"],
    stopCommands: ["save", "quit"],
    ...overrides,
  };
}

function createFakeProcess(): ChildProcessWithoutNullStreams & { simulateExit: (code: number, signal: null) => void } {
  const proc = new EventEmitter() as unknown as ChildProcessWithoutNullStreams & { simulateExit: (code: number, signal: null) => void };
  proc.pid = 12345;
  proc.exitCode = 0;
  proc.signalCode = null;
  proc.killed = false;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = {
    destroyed: false,
    writable: true,
    write: vi.fn((_data: string, cb?: (err: Error | null) => void) => {
      if (cb) process.nextTick(() => cb(null));
      return true;
    }),
  } as any;

  proc.simulateExit = (code: number, signal: null) => {
    proc.exitCode = code;
    proc.signalCode = signal;
    proc.emit("exit", code, signal);
  };

  return proc;
}

function createSpawnMock(proc: ReturnType<typeof createFakeProcess>) {
  return vi.fn(() => proc);
}

describe("ServerRuntimeManager", () => {
  it("returns stopped state for unstarted servers", () => {
    const manager = new ServerRuntimeManager();
    const serverA = createServer({ id: "a", name: "A" });
    const serverB = createServer({ id: "b", name: "B" });

    const snapshot = manager.getRuntimeSnapshot([serverA, serverB]);

    expect(snapshot.activeServerId).toBeNull();
    expect(snapshot.servers).toEqual([
      {
        serverId: "a",
        status: "stopped",
        pid: null,
        startedAt: null,
        lastExit: null,
      },
      {
        serverId: "b",
        status: "stopped",
        pid: null,
        startedAt: null,
        lastExit: null,
      },
    ]);
  });

  it("enforces single-active runtime control", async () => {
    const procA = createFakeProcess();
    const spawnMock = createSpawnMock(procA);
    const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

    const serverA = createServer({ id: "a", name: "A" });
    const serverB = createServer({ id: "b", name: "B" });

    await manager.startServer(serverA, DEFAULT_GLOBAL_CONFIG);

    await expect(manager.startServer(serverB, DEFAULT_GLOBAL_CONFIG)).rejects.toMatchObject({
      code: "ANOTHER_SERVER_RUNNING",
      status: 409,
    });

    const snapshot = manager.getRuntimeSnapshot([serverA, serverB]);
    expect(snapshot.activeServerId).toBe("a");
    expect(snapshot.servers[0].status).toBe("running");

    await manager.stopServer(serverA, STOP_OPTIONS);
  });

  it("rejects duplicate start on same server", async () => {
    const proc = createFakeProcess();
    const spawnMock = createSpawnMock(proc);
    const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

    const server = createServer({ id: "main", name: "Main" });

    await manager.startServer(server, DEFAULT_GLOBAL_CONFIG);

    await expect(manager.startServer(server, DEFAULT_GLOBAL_CONFIG)).rejects.toMatchObject({
      code: "SERVER_ALREADY_RUNNING",
      status: 409,
    });

    await manager.stopServer(server, STOP_OPTIONS);
  });

  it("returns SERVER_NOT_RUNNING when stopping stopped server", async () => {
    const manager = new ServerRuntimeManager();
    const server = createServer({ id: "stopped", name: "Stopped" });

    await expect(manager.stopServer(server, STOP_OPTIONS)).rejects.toMatchObject({
      code: "SERVER_NOT_RUNNING",
      status: 409,
    });
  });

  it("marks immediate start exit as PROCESS_SPAWN_FAILED", async () => {
    const proc = createFakeProcess();
    proc.exitCode = null;
    const spawnMock = createSpawnMock(proc);
    const manager = new ServerRuntimeManager({ startupProbeMs: 120, spawnProcess: spawnMock });

    const server = createServer({ id: "failing", name: "Failing" });

    const startPromise = manager.startServer(server, DEFAULT_GLOBAL_CONFIG);

    proc.simulateExit(1, null);

    await expect(startPromise).rejects.toMatchObject({
      code: "PROCESS_SPAWN_FAILED",
      status: 500,
    });

    const snapshot = manager.getRuntimeSnapshot([server]);
    expect(snapshot.activeServerId).toBeNull();
    expect(snapshot.servers[0].status).toBe("error");
    expect(snapshot.servers[0].lastExit).not.toBeNull();
  });

  describe("Terminal functionality", () => {
    it("should record stdout to terminal buffer", async () => {
      const proc = createFakeProcess();
      const spawnMock = createSpawnMock(proc);
      const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

      const server = createServer({ id: "echo", name: "Echo" });

      const startPromise = manager.startServer(server, DEFAULT_GLOBAL_CONFIG);
      await new Promise((r) => setTimeout(r, 100));
      proc.stdout.emit("data", Buffer.from("hello world\n"));
      await startPromise;

      const history = manager.getTerminalHistory("echo");
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((line) => line.text.includes("hello world"))).toBe(true);

      await manager.stopServer(server, STOP_OPTIONS);
    });

    it("should record stderr to terminal buffer", async () => {
      const proc = createFakeProcess();
      const spawnMock = createSpawnMock(proc);
      const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

      const server = createServer({ id: "stderr", name: "Stderr" });

      const startPromise = manager.startServer(server, DEFAULT_GLOBAL_CONFIG);
      await new Promise((r) => setTimeout(r, 100));
      proc.stderr.emit("data", Buffer.from("error message\n"));
      await startPromise;

      const history = manager.getTerminalHistory("stderr");
      expect(history.length).toBeGreaterThan(0);
      expect(history.some((line) => line.stream === "stderr" && line.text.includes("error message"))).toBe(true);

      await manager.stopServer(server, STOP_OPTIONS);
    });

    it("should notify terminal listeners", async () => {
      const proc = createFakeProcess();
      const spawnMock = createSpawnMock(proc);
      const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

      const server = createServer({ id: "notify", name: "Notify" });

      const receivedLines: any[] = [];
      const listener = (line: any) => {
        receivedLines.push(line);
      };

      manager.subscribeTerminal("notify", listener);

      const startPromise = manager.startServer(server, DEFAULT_GLOBAL_CONFIG);
      await new Promise((r) => setTimeout(r, 100));
      proc.stdout.emit("data", Buffer.from("hello notifier\n"));
      await startPromise;

      expect(receivedLines.length).toBeGreaterThan(0);
      expect(receivedLines.some((line: any) => line.text.includes("hello notifier"))).toBe(true);

      manager.unsubscribeTerminal("notify", listener);
      await manager.stopServer(server, STOP_OPTIONS);
    });

    it("should send commands to running server", async () => {
      const proc = createFakeProcess();
      const spawnMock = createSpawnMock(proc);
      const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

      const server = createServer({ id: "commands", name: "Commands" });

      await manager.startServer(server, DEFAULT_GLOBAL_CONFIG);

      const result = await manager.sendCommands("commands", "hello\nworld");

      expect(result.successCount).toBe(2);
      expect(result.errors).toHaveLength(0);

      const history = manager.getTerminalHistory("commands");
      expect(history.some((line) => line.text.includes("> hello"))).toBe(true);
      expect(history.some((line) => line.text.includes("> world"))).toBe(true);

      await manager.stopServer(server, STOP_OPTIONS);
    });

    it("should reject sending commands when server not running", async () => {
      const manager = new ServerRuntimeManager();

      await expect(manager.sendCommands("stopped", "test")).rejects.toMatchObject({
        code: "SERVER_NOT_RUNNING",
        status: 409,
      });
    });

    it("should return batch result with errors for failed lines", async () => {
      const proc = createFakeProcess();
      const stdinWrite = vi.fn((_data: string, cb?: (err: Error | null) => void) => {
        if (cb) process.nextTick(() => cb(null));
        return true;
      });
      proc.stdin.write = stdinWrite;

      const spawnMock = createSpawnMock(proc);
      const manager = new ServerRuntimeManager({ startupProbeMs: 80, spawnProcess: spawnMock });

      const server = createServer({ id: "batch", name: "Batch" });

      await manager.startServer(server, DEFAULT_GLOBAL_CONFIG);

      const result = await manager.sendCommands("batch", "line1\n\nline2");

      expect(result.successCount).toBe(2);
      expect(result.errors).toHaveLength(0);

      await manager.stopServer(server, STOP_OPTIONS);
    });
  });
});
