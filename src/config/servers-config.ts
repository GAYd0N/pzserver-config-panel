import { basename, isAbsolute, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { AppError } from "../errors/app-error.js";
import type { ServerInstance, ServersConfig, ServerGlobalConfig } from "../types/server.js";

type LegacyPathsConfigFile = {
  workshopPath?: unknown;
  iniFilePath?: unknown;
};

export type LegacyPathsConfig = {
  workshopPath: string;
  iniFilePath: string;
};

type LegacyServerInstance = {
  id?: string;
  name?: string;
  iniPath?: string;
  startCommand?: string;
  stopCommands?: string[];
};

type LegacyServersConfig = {
  workshopPath?: string;
  startScriptPath?: string;
  stopGraceTimeoutMs?: number;
  forceKillTimeoutMs?: number;
  servers?: LegacyServerInstance[];
};

type LoadServersConfigOptions = {
  cliConfigPath?: string;
  serversConfigPath?: string;
  legacyPathsConfigPath?: string;
};

type SaveServersConfigOptions = {
  serversConfigPath?: string;
};

const SERVERS_CONFIG_FILE = "./servers-config.json";
const LEGACY_PATHS_CONFIG_FILE = "./paths-config.json";
const DEFAULT_STOP_GRACE_TIMEOUT_MS = 45000;
const DEFAULT_FORCE_KILL_TIMEOUT_MS = 10000;
const DEFAULT_STOP_COMMANDS = ["save", "quit"];
const DEFAULT_START_SCRIPT_PATH = "./start-server.sh";
const DEFAULT_SERVER_ID = "default";
const DEFAULT_SERVER_NAME = "默认实例";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIniPath(iniPath: string): boolean {
  return isAbsolute(iniPath) && /\.ini$/i.test(iniPath);
}

function isValidStartScriptPath(scriptPath: string): boolean {
  return isAbsolute(scriptPath);
}

function quotePath(path: string): string {
  if (path.includes(" ") && !path.startsWith('"')) {
    return `"${path}"`;
  }
  return path;
}

function ensureValidIniPath(iniPath: string, fieldName: string): void {
  if (!isValidIniPath(iniPath)) {
    throw new AppError(
      "BAD_REQUEST",
      `${fieldName} must be an absolute path ending with .ini`,
    );
  }
}

function ensureValidStartScriptPath(scriptPath: string, fieldName: string): void {
  if (!isValidStartScriptPath(scriptPath)) {
    throw new AppError(
      "BAD_REQUEST",
      `${fieldName} must be an absolute path`,
    );
  }
}

function normalizeTimeout(
  value: unknown,
  fieldName: string,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new AppError("BAD_REQUEST", `${fieldName} must be a positive integer`);
  }

  return Number(value);
}

function normalizeStopCommands(value: unknown, index: number): string[] {
  if (value === undefined) {
    return [...DEFAULT_STOP_COMMANDS];
  }

  if (!Array.isArray(value)) {
    throw new AppError(
      "BAD_REQUEST",
      `servers[${index}].stopCommands must be a string array`,
    );
  }

  const normalized = value
    .map((item, itemIndex) => {
      if (typeof item !== "string") {
        throw new AppError(
          "BAD_REQUEST",
          `servers[${index}].stopCommands[${itemIndex}] must be a string`,
        );
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    return [...DEFAULT_STOP_COMMANDS];
  }

  return normalized;
}

function normalizeStartArgs(value: unknown, index: number, iniBaseName: string): string[] {
  if (value === undefined) {
    return ["-servername", iniBaseName];
  }

  if (!Array.isArray(value)) {
    throw new AppError(
      "BAD_REQUEST",
      `servers[${index}].startArgs must be a string array`,
    );
  }

  return value
    .map((item, itemIndex) => {
      if (typeof item !== "string") {
        throw new AppError(
          "BAD_REQUEST",
          `servers[${index}].startArgs[${itemIndex}] must be a string`,
        );
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function normalizeServerInstance(
  value: unknown,
  index: number,
  usedIds: Set<string>,
): ServerInstance {
  if (!isObject(value)) {
    throw new AppError("BAD_REQUEST", `servers[${index}] must be an object`);
  }

  const rawId = typeof value.id === "string" ? value.id.trim() : "";
  if (!rawId) {
    throw new AppError("BAD_REQUEST", `servers[${index}].id must be a non-empty string`);
  }

  if (usedIds.has(rawId)) {
    throw new AppError("BAD_REQUEST", `servers[${index}].id must be unique`);
  }
  usedIds.add(rawId);

  const rawName = typeof value.name === "string" ? value.name.trim() : "";
  const rawIniPath = typeof value.iniPath === "string" ? value.iniPath.trim() : "";
  ensureValidIniPath(rawIniPath, `servers[${index}].iniPath`);

  const iniBaseName = getIniBaseName(rawIniPath);

  return {
    id: rawId,
    name: rawName || rawId,
    iniPath: rawIniPath,
    startArgs: normalizeStartArgs(value.startArgs, index, iniBaseName),
    stopCommands: normalizeStopCommands(value.stopCommands, index),
  };
}

function normalizeGlobalConfig(value: unknown): ServerGlobalConfig {
  if (!isObject(value)) {
    return {
      workshopPath: "",
      startScriptPath: DEFAULT_START_SCRIPT_PATH,
      stopGraceTimeoutMs: DEFAULT_STOP_GRACE_TIMEOUT_MS,
      forceKillTimeoutMs: DEFAULT_FORCE_KILL_TIMEOUT_MS,
    };
  }

  const workshopPath = typeof value.workshopPath === "string" ? value.workshopPath : "";
  const startScriptPath = typeof value.startScriptPath === "string"
    ? value.startScriptPath
    : DEFAULT_START_SCRIPT_PATH;

  if (startScriptPath && !isValidStartScriptPath(startScriptPath)) {
    throw new AppError("BAD_REQUEST", "global.startScriptPath must be an absolute path");
  }

  return {
    workshopPath,
    startScriptPath,
    stopGraceTimeoutMs: normalizeTimeout(
      value.stopGraceTimeoutMs,
      "global.stopGraceTimeoutMs",
      DEFAULT_STOP_GRACE_TIMEOUT_MS,
    ),
    forceKillTimeoutMs: normalizeTimeout(
      value.forceKillTimeoutMs,
      "global.forceKillTimeoutMs",
      DEFAULT_FORCE_KILL_TIMEOUT_MS,
    ),
  };
}

function normalizeServersConfig(value: unknown): ServersConfig {
  if (!isObject(value)) {
    throw new AppError("BAD_REQUEST", "Servers config must be an object");
  }

  const global = normalizeGlobalConfig(value.global);

  if (!Array.isArray(value.servers)) {
    throw new AppError("BAD_REQUEST", "servers must be an array");
  }

  const usedIds = new Set<string>();
  const servers = value.servers.map((item, index) =>
    normalizeServerInstance(item, index, usedIds),
  );

  return {
    global,
    servers,
  };
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return DEFAULT_SERVER_ID;
  }

  return normalized;
}

function getIniBaseName(iniPath: string): string {
  const fileName = basename(iniPath).replace(/\.ini$/i, "").trim();
  return fileName || DEFAULT_SERVER_ID;
}

function createUniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  const resolved = `${baseId}-${suffix}`;
  usedIds.add(resolved);
  return resolved;
}

function createServerFromIniPath(
  iniPath: string,
  usedIds: Set<string>,
): ServerInstance {
  const baseName = getIniBaseName(iniPath);
  const id = createUniqueId(slugify(baseName), usedIds);

  return {
    id,
    name: baseName || DEFAULT_SERVER_NAME,
    iniPath,
    startArgs: ["-servername", baseName],
    stopCommands: [...DEFAULT_STOP_COMMANDS],
  };
}

function normalizeLegacyPathsConfig(value: unknown): LegacyPathsConfig {
  if (!isObject(value)) {
    return {
      workshopPath: "",
      iniFilePath: "",
    };
  }

  const legacy = value as LegacyPathsConfigFile;

  return {
    workshopPath:
      typeof legacy.workshopPath === "string" ? legacy.workshopPath : "",
    iniFilePath:
      typeof legacy.iniFilePath === "string" ? legacy.iniFilePath : "",
  };
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;
    if (maybeErrno?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeServersConfigFile(
  config: ServersConfig,
  filePath: string,
): Promise<void> {
  await writeFile(
    filePath,
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

function parseStartCommandToArgs(startCommand: string): { scriptPath: string; args: string[] } {
  const parts = startCommand.trim().split(/\s+/);
  if (parts.length === 0) {
    return { scriptPath: DEFAULT_START_SCRIPT_PATH, args: [] };
  }

  const scriptPath = parts[0];
  const args = parts.slice(1);
  return { scriptPath, args };
}

function migrateLegacyServersConfig(legacy: LegacyServersConfig): ServersConfig {
  const servers: ServerInstance[] = [];
  const usedIds = new Set<string>();

  if (Array.isArray(legacy.servers)) {
    for (const legacyServer of legacy.servers) {
      const rawId = typeof legacyServer.id === "string" ? legacyServer.id.trim() : "";
      if (!rawId) continue;

      const rawIniPath = typeof legacyServer.iniPath === "string" ? legacyServer.iniPath.trim() : "";
      if (!isValidIniPath(rawIniPath)) continue;

      const id = createUniqueId(rawId, usedIds);
      const name = typeof legacyServer.name === "string" ? legacyServer.name.trim() : id;
      const iniBaseName = getIniBaseName(rawIniPath);

      let startArgs: string[];
      if (typeof legacyServer.startCommand === "string" && legacyServer.startCommand.trim()) {
        const { args } = parseStartCommandToArgs(legacyServer.startCommand);
        startArgs = args.length > 0 ? args : ["-servername", iniBaseName];
      } else {
        startArgs = ["-servername", iniBaseName];
      }

      const stopCommands = Array.isArray(legacyServer.stopCommands)
        ? legacyServer.stopCommands.filter((cmd): cmd is string => typeof cmd === "string")
        : [...DEFAULT_STOP_COMMANDS];

      servers.push({
        id,
        name: name || id,
        iniPath: rawIniPath,
        startArgs,
        stopCommands,
      });
    }
  }

  let startScriptPath = DEFAULT_START_SCRIPT_PATH;
  if (typeof legacy.startScriptPath === "string" && legacy.startScriptPath.trim()) {
    startScriptPath = legacy.startScriptPath.trim();
  } else if (servers.length > 0 && typeof legacy.servers?.[0]?.startCommand === "string") {
    const { scriptPath } = parseStartCommandToArgs(legacy.servers[0].startCommand);
    if (isAbsolute(scriptPath)) {
      startScriptPath = scriptPath;
    }
  }

  return {
    global: {
      workshopPath: typeof legacy.workshopPath === "string" ? legacy.workshopPath : "",
      startScriptPath,
      stopGraceTimeoutMs: normalizeTimeout(
        legacy.stopGraceTimeoutMs,
        "stopGraceTimeoutMs",
        DEFAULT_STOP_GRACE_TIMEOUT_MS,
      ),
      forceKillTimeoutMs: normalizeTimeout(
        legacy.forceKillTimeoutMs,
        "forceKillTimeoutMs",
        DEFAULT_FORCE_KILL_TIMEOUT_MS,
      ),
    },
    servers,
  };
}

function createMigratedConfig(
  legacy: LegacyPathsConfig,
  cliConfigPath?: string,
): ServersConfig {
  const servers: ServerInstance[] = [];
  const usedIds = new Set<string>();
  const iniCandidates = [legacy.iniFilePath, cliConfigPath ?? ""];

  for (const candidate of iniCandidates) {
    const normalized = candidate.trim();
    if (!normalized || !isValidIniPath(normalized)) {
      continue;
    }

    servers.push(createServerFromIniPath(normalized, usedIds));
    break;
  }

  return {
    global: {
      workshopPath: legacy.workshopPath,
      startScriptPath: DEFAULT_START_SCRIPT_PATH,
      stopGraceTimeoutMs: DEFAULT_STOP_GRACE_TIMEOUT_MS,
      forceKillTimeoutMs: DEFAULT_FORCE_KILL_TIMEOUT_MS,
    },
    servers,
  };
}

export function getServerInstance(
  config: ServersConfig,
  serverId?: string,
): ServerInstance | null {
  if (config.servers.length === 0) {
    return null;
  }

  if (!serverId) {
    return config.servers[0];
  }

  return config.servers.find((server) => server.id === serverId) ?? null;
}

export function toLegacyPathsConfig(
  config: ServersConfig,
  serverId?: string,
): LegacyPathsConfig {
  const selectedServer = getServerInstance(config, serverId);

  return {
    workshopPath: config.global.workshopPath,
    iniFilePath: selectedServer?.iniPath ?? "",
  };
}

export function applyLegacyPathsConfig(
  config: ServersConfig,
  legacyPaths: LegacyPathsConfig,
): ServersConfig {
  const workshopPath = legacyPaths.workshopPath.trim();
  const iniFilePath = legacyPaths.iniFilePath.trim();

  const nextServers = config.servers.map((server) => ({
    ...server,
    stopCommands: [...server.stopCommands],
    startArgs: [...server.startArgs],
  }));

  if (iniFilePath) {
    ensureValidIniPath(iniFilePath, "iniFilePath");
    if (nextServers.length === 0) {
      const usedIds = new Set<string>();
      nextServers.push(createServerFromIniPath(iniFilePath, usedIds));
    } else {
      nextServers[0] = {
        ...nextServers[0],
        iniPath: iniFilePath,
      };
    }
  }

  return {
    global: {
      ...config.global,
      workshopPath,
    },
    servers: nextServers,
  };
}

export async function loadServersConfig(
  options: LoadServersConfigOptions = {},
): Promise<ServersConfig> {
  const serversConfigPath = options.serversConfigPath ?? SERVERS_CONFIG_FILE;
  const legacyPathsConfigPath =
    options.legacyPathsConfigPath ?? LEGACY_PATHS_CONFIG_FILE;

  const rawServersConfig = await readJsonIfExists(serversConfigPath);
  if (rawServersConfig !== null) {
    const hasNewStructure = isObject(rawServersConfig) && "global" in rawServersConfig;
    
    if (hasNewStructure) {
      return normalizeServersConfig(rawServersConfig);
    }

    const legacyConfig = rawServersConfig as LegacyServersConfig;
    const migratedConfig = migrateLegacyServersConfig(legacyConfig);
    await writeServersConfigFile(migratedConfig, serversConfigPath);
    return migratedConfig;
  }

  const rawLegacyConfig = await readJsonIfExists(legacyPathsConfigPath);
  const legacyConfig = normalizeLegacyPathsConfig(rawLegacyConfig);
  const migratedConfig = createMigratedConfig(legacyConfig, options.cliConfigPath);

  if (migratedConfig.servers.length === 0) {
    const dummyIniPath = resolve("dev-data", "dummy.ini");
    const usedIds = new Set<string>();
    migratedConfig.servers.push(createServerFromIniPath(dummyIniPath, usedIds));
  }

  await writeServersConfigFile(migratedConfig, serversConfigPath);
  return migratedConfig;
}

export async function saveServersConfig(
  rawConfig: unknown,
  options: SaveServersConfigOptions = {},
): Promise<ServersConfig> {
  const serversConfigPath = options.serversConfigPath ?? SERVERS_CONFIG_FILE;
  const normalized = normalizeServersConfig(rawConfig);
  await writeServersConfigFile(normalized, serversConfigPath);
  return normalized;
}

export function generateServerId(name: string, existingIds: Set<string>): string {
  const baseId = slugify(name);
  return createUniqueId(baseId || DEFAULT_SERVER_ID, new Set(existingIds));
}

export function buildStartCommand(globalConfig: ServerGlobalConfig, server: ServerInstance): string {
  const scriptPath = quotePath(globalConfig.startScriptPath);
  const args = server.startArgs.join(" ");
  return `${scriptPath} ${args}`.trim();
}
