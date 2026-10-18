import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  applyLegacyPathsConfig,
  loadServersConfig,
  saveServersConfig,
  toLegacyPathsConfig,
} from "../src/config/servers-config.js";
import { AppError } from "../src/errors/app-error.js";
import type { ServersConfig } from "../src/types/server.js";

const testDir = "test-fixtures/servers-config";
const serversConfigPath = join(testDir, "servers-config.json");
const legacyPathsConfigPath = join(testDir, "paths-config.json");

describe("servers-config", () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should migrate from legacy paths-config.json", async () => {
    await writeFile(
      legacyPathsConfigPath,
      JSON.stringify(
        {
          workshopPath: "/home/steam/Steam/steamapps/workshop/content/108600",
          iniFilePath: "/home/steam/Zomboid/Server/servertest.ini",
        },
        null,
        2,
      ),
      "utf8",
    );

    const config = await loadServersConfig({
      serversConfigPath,
      legacyPathsConfigPath,
    });

    expect(config.global.workshopPath).toBe(
      "/home/steam/Steam/steamapps/workshop/content/108600",
    );
    expect(config.global.startScriptPath).toBe("./start-server.sh");
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0]).toMatchObject({
      id: "servertest",
      name: "servertest",
      iniPath: "/home/steam/Zomboid/Server/servertest.ini",
      startArgs: ["-servername", "servertest"],
      stopCommands: ["save", "quit"],
    });

    const persisted = JSON.parse(await readFile(serversConfigPath, "utf8")) as ServersConfig;
    expect(persisted.servers).toHaveLength(1);
    expect(persisted.global).toBeDefined();
  });

  it("should initialize from CLI config path when no config exists", async () => {
    const config = await loadServersConfig({
      cliConfigPath: "/srv/pz/server-main.ini",
      serversConfigPath,
      legacyPathsConfigPath,
    });

    expect(config.servers).toHaveLength(1);
    expect(config.servers[0]).toMatchObject({
      id: "server-main",
      iniPath: "/srv/pz/server-main.ini",
      startArgs: ["-servername", "server-main"],
      stopCommands: ["save", "quit"],
    });
    expect(config.global.startScriptPath).toBe("./start-server.sh");
  });

  it("should reject duplicate server ids", async () => {
    const validConfig: ServersConfig = {
      global: {
        workshopPath: "",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "same",
          name: "A",
          iniPath: "/a/test.ini",
          startArgs: ["-servername", "a"],
          stopCommands: ["save", "quit"],
        },
        {
          id: "same",
          name: "B",
          iniPath: "/b/test.ini",
          startArgs: ["-servername", "b"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    await expect(
      saveServersConfig(validConfig, { serversConfigPath }),
    ).rejects.toThrow(AppError);

    await expect(
      saveServersConfig(validConfig, { serversConfigPath }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("should reject non-absolute iniPath", async () => {
    await expect(
      saveServersConfig(
        {
          global: {
            workshopPath: "",
            startScriptPath: "/start.sh",
            stopGraceTimeoutMs: 45000,
            forceKillTimeoutMs: 10000,
          },
          servers: [
            {
              id: "main",
              name: "Main",
              iniPath: "./relative.ini",
              startArgs: ["-servername", "main"],
              stopCommands: ["save", "quit"],
            },
          ],
        },
        { serversConfigPath },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
    });
  });

  it("should save with startArgs instead of startCommand", async () => {
    const config: ServersConfig = {
      global: {
        workshopPath: "/workshop",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "main",
          name: "Main",
          iniPath: "/home/steam/Zomboid/Server/main.ini",
          startArgs: ["-servername", "main", "-debug"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    const saved = await saveServersConfig(config, { serversConfigPath });
    expect(saved.servers[0].startArgs).toEqual(["-servername", "main", "-debug"]);
    
    // 验证持久化文件
    const persisted = JSON.parse(await readFile(serversConfigPath, "utf8")) as ServersConfig;
    expect(persisted.servers[0].startArgs).toEqual(["-servername", "main", "-debug"]);
  });

  it("should persist scheduled commands and default missing ones to an empty list", async () => {
    const config = {
      global: {
        workshopPath: "",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "main",
          name: "Main",
          iniPath: "/srv/main.ini",
          startArgs: ["-servername", "main"],
          stopCommands: ["save", "quit"],
          scheduledCommands: [
            { id: "nightly", action: "restart", cron: "0 4 * * *", enabled: true },
            { id: "save-only", action: "stop", cron: "*/30 * * * *", enabled: false },
          ],
        },
        {
          id: "other",
          name: "Other",
          iniPath: "/srv/other.ini",
          startArgs: ["-servername", "other"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    const saved = await saveServersConfig(config, { serversConfigPath });

    expect(saved.servers[0].scheduledCommands).toEqual([
      { id: "nightly", name: "", action: "restart", cron: "0 4 * * *", enabled: true },
      { id: "save-only", name: "", action: "stop", cron: "*/30 * * * *", enabled: false },
    ]);
    expect(saved.servers[1].scheduledCommands).toEqual([]);

    const persisted = JSON.parse(await readFile(serversConfigPath, "utf8")) as ServersConfig;
    expect(persisted.servers[0].scheduledCommands).toHaveLength(2);
  });

  it("should persist the save path and default missing ones to an empty string", async () => {
    const config = {
      global: {
        workshopPath: "",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "main",
          name: "Main",
          iniPath: "/srv/main.ini",
          savePath: "/srv/saves/main",
          startArgs: ["-servername", "main"],
          stopCommands: ["save", "quit"],
        },
        {
          id: "other",
          name: "Other",
          iniPath: "/srv/other.ini",
          startArgs: ["-servername", "other"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    const saved = await saveServersConfig(config, { serversConfigPath });

    expect(saved.servers[0].savePath).toBe("/srv/saves/main");
    expect(saved.servers[1].savePath).toBe("");

    const persisted = JSON.parse(await readFile(serversConfigPath, "utf8")) as ServersConfig;
    expect(persisted.servers[0].savePath).toBe("/srv/saves/main");
  });

  it("should reject a relative save path", async () => {
    const config = {
      global: {
        workshopPath: "",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "main",
          name: "Main",
          iniPath: "/srv/main.ini",
          savePath: "saves/main",
          startArgs: ["-servername", "main"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    await expect(
      saveServersConfig(config, { serversConfigPath }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });

  it("should reject invalid scheduled command actions and cron expressions", async () => {
    const baseConfig = {
      global: {
        workshopPath: "",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "main",
          name: "Main",
          iniPath: "/srv/main.ini",
          startArgs: ["-servername", "main"],
          stopCommands: ["save", "quit"],
          scheduledCommands: [
            { id: "bad-action", action: "reboot", cron: "0 4 * * *", enabled: true },
          ],
        },
      ],
    };

    await expect(
      saveServersConfig(baseConfig, { serversConfigPath }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });

    baseConfig.servers[0].scheduledCommands = [
      { id: "bad-cron", action: "restart", cron: "0 25 * * *", enabled: true },
    ];

    await expect(
      saveServersConfig(baseConfig, { serversConfigPath }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });

  it("should support legacy /paths compatibility mapping", () => {
    const config: ServersConfig = {
      global: {
        workshopPath: "/workshop",
        startScriptPath: "/start.sh",
        stopGraceTimeoutMs: 45000,
        forceKillTimeoutMs: 10000,
      },
      servers: [
        {
          id: "a",
          name: "A",
          iniPath: "/srv/a.ini",
          startArgs: ["-servername", "a"],
          stopCommands: ["save", "quit"],
        },
      ],
    };

    const updated = applyLegacyPathsConfig(config, {
      workshopPath: "/new-workshop",
      iniFilePath: "/srv/b.ini",
    });

    expect(updated.global.workshopPath).toBe("/new-workshop");
    expect(updated.servers[0].iniPath).toBe("/srv/b.ini");
    expect(toLegacyPathsConfig(updated)).toEqual({
      workshopPath: "/new-workshop",
      iniFilePath: "/srv/b.ini",
    });
  });
});
