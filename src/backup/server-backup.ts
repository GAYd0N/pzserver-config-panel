import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdtemp, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

import { AppError } from "../errors/app-error.js";
import type { ServerInstance } from "../types/server.js";

const execFileAsync = promisify(execFile);

const BACKUP_EXTENSION = ".tar.gz";
const BACKUP_TEMP_SUFFIX = ".part";
const BACKUP_TIMEOUT_MS = 30 * 60 * 1000;
const BACKUP_MAX_BUFFER = 10 * 1024 * 1024;

export type ServerBackupInfo = {
  name: string;
  size: number;
  createdAt: string;
};

export type ServerBackupStatus = {
  running: boolean;
  startedAt: string | null;
};

export type CreateServerBackupOptions = {
  now?: () => Date;
};

const activeBackups = new Map<string, string>();

export function getServerBackupStatus(serverId: string): ServerBackupStatus {
  const startedAt = activeBackups.get(serverId);
  return {
    running: startedAt !== undefined,
    startedAt: startedAt ?? null,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatBackupTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function sanitizeBackupName(value: string): string {
  const sanitized = value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return sanitized || "server";
}

function requireSavePath(server: ServerInstance): string {
  const savePath = typeof server.savePath === "string" ? server.savePath.trim() : "";
  if (!savePath) {
    throw new AppError("BAD_REQUEST", "请先在备份配置中设置存档文件夹");
  }

  return savePath;
}

function getBackupDirectory(server: ServerInstance): string {
  return resolve(dirname(requireSavePath(server)));
}

export function getBackupPrefix(server: ServerInstance): string {
  return `${sanitizeBackupName(server.name || server.id)}-backup-`;
}

async function ensureSourceExists(server: ServerInstance): Promise<{
  savePath: string;
  iniPath: string;
}> {
  const savePath = resolve(requireSavePath(server));

  try {
    const sourceStat = await stat(savePath);
    if (!sourceStat.isDirectory()) {
      throw new AppError("BAD_REQUEST", `存档文件夹不是目录: ${savePath}`);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("BAD_REQUEST", `存档文件夹不存在: ${savePath}`);
  }

  const iniPath = resolve(server.iniPath);
  try {
    const iniStat = await stat(iniPath);
    if (!iniStat.isFile()) {
      throw new AppError("BAD_REQUEST", `服务器配置文件不是文件: ${iniPath}`);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("BAD_REQUEST", `服务器配置文件不存在: ${iniPath}`);
  }

  return { savePath, iniPath };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveUniqueArchivePath(
  directory: string,
  baseName: string,
): Promise<string> {
  let candidate = join(directory, `${baseName}${BACKUP_EXTENSION}`);
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = join(directory, `${baseName}-${suffix}${BACKUP_EXTENSION}`);
    suffix += 1;
  }

  return candidate;
}

function toBackupInfo(name: string, fileStat: {
  size: number;
  mtime: Date;
}): ServerBackupInfo {
  return {
    name,
    size: fileStat.size,
    createdAt: fileStat.mtime.toISOString(),
  };
}

export async function createServerBackup(
  server: ServerInstance,
  options: CreateServerBackupOptions = {},
): Promise<ServerBackupInfo> {
  if (activeBackups.has(server.id)) {
    throw new AppError(
      "BACKUP_IN_PROGRESS",
      "已有备份正在进行，请等待当前备份完成",
    );
  }

  activeBackups.set(server.id, new Date().toISOString());

  try {
    return await runServerBackup(server, options);
  } finally {
    activeBackups.delete(server.id);
  }
}

async function runServerBackup(
  server: ServerInstance,
  options: CreateServerBackupOptions = {},
): Promise<ServerBackupInfo> {
  const { savePath, iniPath } = await ensureSourceExists(server);
  const directory = dirname(savePath);
  const saveFolderName = basename(savePath);
  if (!saveFolderName || saveFolderName === "." || saveFolderName === "..") {
    throw new AppError("BAD_REQUEST", "存档文件夹路径无效");
  }

  const timestamp = formatBackupTimestamp((options.now ?? (() => new Date()))());
  const targetPath = await resolveUniqueArchivePath(
    directory,
    `${getBackupPrefix(server)}${timestamp}`,
  );
  const tarPath = `${targetPath}.tar`;
  const tarFileName = basename(tarPath);
  const tempPath = `${targetPath}${BACKUP_TEMP_SUFFIX}`;
  let iniStageDir: string | null = null;

  try {
    // Build the archive in two steps so every tar invocation has only one
    // change-directory option before its operands. bsdtar on Windows does not
    // accept a second -C after a file operand, while GNU tar does. All tar
    // paths are relative to `cwd`: GNU tar treats an absolute Windows archive
    // path such as D:\saves\out.tar as a remote `host:path` archive.
    await execFileAsync(
      "tar",
      ["-cf", tarFileName, saveFolderName],
      {
        cwd: directory,
        timeout: BACKUP_TIMEOUT_MS,
        maxBuffer: BACKUP_MAX_BUFFER,
        windowsHide: true,
      },
    );

    // Stage the INI in a temporary sibling directory so it can be appended
    // without an absolute -C path, which also fails under MSYS GNU tar.
    iniStageDir = await mkdtemp(join(directory, ".pzbackup-ini-"));
    await copyFile(iniPath, join(iniStageDir, basename(iniPath)));

    await execFileAsync(
      "tar",
      ["-rf", tarFileName, "-C", basename(iniStageDir), basename(iniPath)],
      {
        cwd: directory,
        timeout: BACKUP_TIMEOUT_MS,
        maxBuffer: BACKUP_MAX_BUFFER,
        windowsHide: true,
      },
    );
    await pipeline(
      createReadStream(tarPath),
      createGzip(),
      createWriteStream(tempPath),
    );
    await rename(tempPath, targetPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AppError("IO_ERROR", `创建备份失败: ${detail}`);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
    await rm(tarPath, { force: true }).catch(() => undefined);
    if (iniStageDir) {
      await rm(iniStageDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const fileStat = await stat(targetPath);
  return toBackupInfo(basename(targetPath), fileStat);
}

export async function listServerBackups(
  server: ServerInstance,
): Promise<ServerBackupInfo[]> {
  const directory = getBackupDirectory(server);
  const prefix = getBackupPrefix(server);

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const backups: ServerBackupInfo[] = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith(prefix) ||
      !entry.name.endsWith(BACKUP_EXTENSION)
    ) {
      continue;
    }

    try {
      const fileStat = await stat(join(directory, entry.name));
      backups.push(toBackupInfo(entry.name, fileStat));
    } catch {
      // The archive may disappear between readdir and stat; ignore it.
    }
  }

  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function deleteServerBackup(
  server: ServerInstance,
  fileName: string,
): Promise<void> {
  const directory = getBackupDirectory(server);
  const prefix = getBackupPrefix(server);
  const normalized = typeof fileName === "string" ? fileName.trim() : "";

  if (
    !normalized ||
    basename(normalized) !== normalized ||
    !normalized.startsWith(prefix) ||
    !normalized.endsWith(BACKUP_EXTENSION)
  ) {
    throw new AppError("BAD_REQUEST", "备份文件名无效");
  }

  const targetPath = join(directory, normalized);

  try {
    await unlink(targetPath);
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;
    if (maybeErrno?.code === "ENOENT") {
      throw new AppError("NOT_FOUND", `备份不存在: ${normalized}`);
    }
    throw new AppError("IO_ERROR", `删除备份失败: ${normalized}`);
  }
}
