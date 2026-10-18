import { lstat, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { AppError } from "../errors/app-error.js";

const WORKSHOP_ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type RemoveWorkshopItemResult = {
  removed: boolean;
  path: string;
};

function resolveWorkshopItemPath(workshopPath: string, itemId: string): string {
  const normalizedId = itemId.trim();
  if (
    !normalizedId ||
    normalizedId === "." ||
    normalizedId === ".." ||
    !WORKSHOP_ITEM_ID_PATTERN.test(normalizedId)
  ) {
    throw new AppError("BAD_REQUEST", "Invalid workshop item id");
  }

  const rootAbs = resolve(workshopPath);
  const itemPath = resolve(rootAbs, normalizedId);
  const relToRoot = relative(rootAbs, itemPath);

  if (!relToRoot || relToRoot.startsWith("..") || isAbsolute(relToRoot)) {
    throw new AppError("BAD_REQUEST", "Invalid workshop item path");
  }

  return itemPath;
}

export async function removeWorkshopItemDirectory(
  workshopPath: string,
  itemId: string,
): Promise<RemoveWorkshopItemResult> {
  const itemPath = resolveWorkshopItemPath(workshopPath, itemId);

  try {
    const itemStat = await lstat(itemPath);
    if (itemStat.isSymbolicLink() || !itemStat.isDirectory()) {
      throw new AppError("BAD_REQUEST", "Workshop item path is not a directory");
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { removed: false, path: itemPath };
    }
    throw new AppError("IO_ERROR", "Failed to inspect workshop item directory");
  }

  try {
    await rm(itemPath, { recursive: true, force: false });
  } catch {
    throw new AppError("IO_ERROR", "Failed to delete workshop item directory");
  }

  return { removed: true, path: itemPath };
}
