import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import type { WorkshopItem, SubMod } from "../types/config.js";

function toUrlPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function hasWindowsDrivePrefix(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p);
}

function resolveMediaFilePath(folderPath: string, mediaValue: string): string {
  const trimmed = mediaValue.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  if (!trimmed) return "";

  if (isAbsolute(trimmed) || hasWindowsDrivePrefix(trimmed)) {
    return trimmed;
  }

  const segments = trimmed.split(/[\\/]+/).filter((s) => s.length > 0);
  return join(folderPath, ...segments);
}

function resolveRelativePath(workshopRootPath: string, folderPath: string, mediaValue: string): string {
  const rootAbs = resolve(workshopRootPath);
  const filePath = mediaValue ? resolveMediaFilePath(folderPath, mediaValue) : "";
  const absolutePath = filePath ? resolve(filePath) : "";
  const relToRoot = absolutePath ? toUrlPath(relative(rootAbs, absolutePath)) : "";
  const isUnderRoot = !!relToRoot && relToRoot !== ".." && !relToRoot.startsWith("../");
  const exists = absolutePath && isUnderRoot && existsSync(absolutePath);
  return exists ? relToRoot : "";
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseModInfo(content: string, folderPath: string, workshopRootPath: string): SubMod | null {
  const lines = content.split(/\r?\n/);
  const result: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (key === "name") result.name = value;
    if (key === "id") result.id = value;
    if (key === "description") result.description = value;
    if (key === "poster") result.poster = value;
    if (key === "icon") result.icon = value;
    if (key === "require") result.require = value;
    if (key === "category") result.category = value;
    if (key === "loadModBefore") result.loadModBefore = value;
    if (key === "loadModAfter") result.loadModAfter = value;
    if (key === "incompatible") result.incompatible = value;
    if (key === "author") result.author = value;
    if (key === "url") result.url = value;
    if (key === "modversion") result.modversion = value;
    if (key === "pack") result.pack = value;
    if (key === "tiledef") result.tiledef = value;
    if (key === "versionMin") result.versionMin = value;
    if (key === "versionMax") result.versionMax = value;
  }

  if (!result.name || !result.id) return null;

  const posterRel = resolveRelativePath(workshopRootPath, folderPath, result.poster ?? "");
  const iconRel = resolveRelativePath(workshopRootPath, folderPath, result.icon ?? "");
  const rootAbs = resolve(workshopRootPath);

  const modId = result.id;
  const requireList = parseCommaList(result.require ?? "").filter((s) => s !== modId);
  const loadModBeforeList = parseCommaList(result.loadModBefore ?? "").filter((s) => s !== modId);
  const loadModAfterList = parseCommaList(result.loadModAfter ?? "").filter((s) => s !== modId);
  const incompatibleList = parseCommaList(result.incompatible ?? "").filter((s) => s !== modId);

  return {
    name: result.name,
    id: modId,
    description: result.description ?? "",
    poster: posterRel,
    icon: iconRel,
    path: toUrlPath(relative(rootAbs, resolve(folderPath))),
    require: requireList,
    category: parseCommaList(result.category ?? ""),
    loadModBefore: loadModBeforeList,
    loadModAfter: loadModAfterList,
    incompatible: incompatibleList,
    author: result.author ?? "",
    url: result.url ?? "",
    modversion: result.modversion ?? "",
    pack: parseCommaList(result.pack ?? ""),
    tiledef: parseCommaList(result.tiledef ?? ""),
    versionMin: result.versionMin ?? "",
    versionMax: result.versionMax ?? "",
  };
}

async function findModInfoFiles(dirPath: string): Promise<Array<{ path: string; mtime: Date }>> {
  const modInfoFiles: Array<{ path: string; mtime: Date }> = [];

  async function search(currentPath: string) {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          await search(fullPath);
        } else if (entry.name.toLowerCase() === "mod.info") {
          try {
            const fileStat = await stat(fullPath);
            modInfoFiles.push({ path: fullPath, mtime: fileStat.mtime });
          } catch (error) {
            console.warn(`[Workshop Parser] Failed to get stat for: ${fullPath}`);
          }
        }
      }
    } catch (error) {
      console.warn(`[Workshop Parser] Failed to read directory: ${currentPath}`);
    }
  }

  await search(dirPath);
  return modInfoFiles;
}

async function findModMaps(itemPath: string): Promise<string[]> {
  const maps: Set<string> = new Set();

  async function search(currentPath: string) {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = join(currentPath, entry.name);

        const dirName = entry.name.toLowerCase();
        if (dirName === "maps" && basename(currentPath).toLowerCase() === "media") {
          try {
            const subEntries = await readdir(fullPath, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (subEntry.isDirectory()) {
                maps.add(subEntry.name);
              }
            }
          } catch {
            // skip
          }
        } else {
          await search(fullPath);
        }
      }
    } catch {
      // skip
    }
  }

  await search(itemPath);
  return [...maps];
}

async function parseWorkshopItem(workshopPath: string, itemId: string): Promise<WorkshopItem> {
  const itemPath = join(workshopPath, itemId);
  const isDownloaded = existsSync(itemPath);

  if (!isDownloaded) {
    return {
      id: itemId,
      isDownloaded: false,
      subMods: [],
      maps: [],
    };
  }

  const modInfoFiles = await findModInfoFiles(itemPath);
  const subModsMap = new Map<string, { subMod: SubMod; mtime: Date }>();

  for (const { path: modInfoFile, mtime } of modInfoFiles) {
    try {
      const content = await readFile(modInfoFile, "utf8");
      const folderPath = dirname(modInfoFile);
      const subMod = parseModInfo(content, folderPath, workshopPath);
      if (subMod) {
        const existing = subModsMap.get(subMod.id);
        if (!existing || mtime > existing.mtime) {
          subModsMap.set(subMod.id, { subMod, mtime });
        }
      }
    } catch (error) {
      console.warn(`[Workshop Parser] Failed to parse mod.info: ${modInfoFile}`);
    }
  }

  const subMods = Array.from(subModsMap.values()).map(({ subMod }) => subMod);
  const maps = await findModMaps(itemPath);

  return {
    id: itemId,
    isDownloaded: true,
    subMods,
    maps,
  };
}

export async function parseWorkshopItems(workshopPath: string, itemIds: string[]): Promise<WorkshopItem[]> {
  const results: WorkshopItem[] = [];

  for (const itemId of itemIds) {
    const workshopItem = await parseWorkshopItem(workshopPath, itemId);
    results.push(workshopItem);
  }

  return results;
}
