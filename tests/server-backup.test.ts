import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  createServerBackup,
  deleteServerBackup,
  listServerBackups,
} from "../src/backup/server-backup.js";
import type { ServerInstance } from "../src/types/server.js";

const execFileAsync = promisify(execFile);
const testDir = "test-fixtures/server-backup";
const savesDir = join(testDir, "saves");
const savePath = join(savesDir, "main");
const iniPath = join(testDir, "server", "main.ini");

function createServer(overrides: Partial<ServerInstance> = {}): ServerInstance {
  return {
    id: "main",
    name: "Main",
    iniPath,
    savePath,
    startArgs: ["-servername", "main"],
    stopCommands: ["save", "quit"],
    scheduledCommands: [],
    ...overrides,
  };
}

async function listArchiveEntries(archivePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("tar", ["-tzf", archivePath]);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\\/g, "/").replace(/\/$/, ""))
    .filter(Boolean);
}

describe("server backup archives", () => {
  beforeEach(async () => {
    await mkdir(join(savePath, "nested"), { recursive: true });
    await mkdir(join(testDir, "server"), { recursive: true });
    await writeFile(join(savePath, "players.db"), "players");
    await writeFile(join(savePath, "nested", "chunk.bin"), "chunk");
    await writeFile(iniPath, "ServerName=main\n");
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("creates a tar.gz next to the save folder containing the save folder and ini", async () => {
    const backup = await createServerBackup(createServer(), {
      now: () => new Date(2026, 9, 18, 16, 40, 5),
    });

    expect(backup.name).toBe("Main-backup-2026-10-18-16-40-05.tar.gz");
    expect(backup.size).toBeGreaterThan(0);

    const archivePath = join(savesDir, backup.name);
    const archiveStat = await stat(archivePath);
    expect(archiveStat.isFile()).toBe(true);

    const entries = await listArchiveEntries(archivePath);
    expect(entries).toContain("main/players.db");
    expect(entries).toContain("main/nested/chunk.bin");
    expect(entries).toContain("main.ini");
  });

  it("adds a numeric suffix when a backup with the same timestamp exists", async () => {
    const now = () => new Date(2026, 9, 18, 16, 40, 5);
    const first = await createServerBackup(createServer(), { now });
    const second = await createServerBackup(createServer(), { now });

    expect(first.name).toBe("Main-backup-2026-10-18-16-40-05.tar.gz");
    expect(second.name).toBe("Main-backup-2026-10-18-16-40-05-2.tar.gz");
  });

  it("lists and deletes backups for the matching server name", async () => {
    const backup = await createServerBackup(createServer(), {
      now: () => new Date(2026, 9, 18, 16, 40, 5),
    });

    const backups = await listServerBackups(createServer());
    expect(backups.map((item) => item.name)).toEqual([backup.name]);
    expect(backups[0].size).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(backups[0].createdAt).getTime())).toBe(false);

    await deleteServerBackup(createServer(), backup.name);
    expect(await listServerBackups(createServer())).toEqual([]);
  });

  it("rejects unsafe backup file names", async () => {
    await expect(
      deleteServerBackup(createServer(), "../main-backup-2026-10-18-16-40-05.tar.gz"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      deleteServerBackup(createServer(), "another-backup-2026-10-18-16-40-05.tar.gz"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      deleteServerBackup(createServer(), "Main-backup-2026-10-18-16-40-05.tar.gz"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("requires an existing save folder and ini file", async () => {
    await expect(
      createServerBackup(createServer({ savePath: "" })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      createServerBackup(createServer({ savePath: join(testDir, "missing") })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      createServerBackup(createServer({ iniPath: join(testDir, "missing.ini") })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
