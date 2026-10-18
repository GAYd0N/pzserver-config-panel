import express from "express";
import { readConfig, saveConfig } from "../config/service.js";
import { AppError, toErrorResponse } from "../errors/app-error.js";
import { stat } from "node:fs/promises";
import { parseWorkshopItems } from "../config/workshop-parser.js";
import { removeWorkshopItemDirectory } from "../config/workshop-files.js";
import { relative, resolve } from "node:path";
import type { WorkshopItem } from "../types/config.js";
import {
  applyLegacyPathsConfig,
  getServerInstance,
  loadServersConfig,
  saveServersConfig,
  toLegacyPathsConfig,
} from "../config/servers-config.js";
import type { LegacyPathsConfig } from "../config/servers-config.js";
import type { ServerInstance } from "../types/server.js";
import type { ServersConfig } from "../types/server.js";

function sendRouteError(error: unknown, res: express.Response): void {
  if (error instanceof AppError) {
    res.status(error.status).json(toErrorResponse(error));
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}

function getServerIdQuery(req: express.Request): string | undefined {
  const value = req.query.serverId;
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new AppError("BAD_REQUEST", "serverId query parameter must be a string");
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function resolveConfigServer(
  config: ServersConfig,
  req: express.Request,
): ServerInstance {
  const serverId = getServerIdQuery(req);
  const server = getServerInstance(config, serverId);

  if (!serverId && !server) {
    throw new AppError("BAD_REQUEST", "No server instance configured");
  }

  if (serverId && !server) {
    throw new AppError("NOT_FOUND", `Server instance not found: ${serverId}`);
  }

  if (!server) {
    throw new AppError("BAD_REQUEST", "No server instance configured");
  }

  return server;
}

function validateLegacyPathsPayload(body: unknown): LegacyPathsConfig {
  if (!body || typeof body !== "object") {
    throw new AppError("BAD_REQUEST", "Invalid paths configuration");
  }

  const raw = body as { workshopPath?: unknown; iniFilePath?: unknown };
  if (typeof raw.workshopPath !== "string" || typeof raw.iniFilePath !== "string") {
    throw new AppError("BAD_REQUEST", "Invalid paths configuration");
  }

  return {
    workshopPath: raw.workshopPath,
    iniFilePath: raw.iniFilePath,
  };
}

async function buildWorkshopItems(
  workshopPath: string,
  configItems: Array<{ key: string; value: string }>,
): Promise<WorkshopItem[]> {
  const workshopItemsItem = configItems.find((item) => item.key === "WorkshopItems");
  if (!workshopItemsItem || !workshopItemsItem.value) {
    return [];
  }

  const itemIds = workshopItemsItem.value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (itemIds.length === 0) {
    return [];
  }

  if (!workshopPath) {
    return itemIds.map((id) => ({
      id,
      isDownloaded: false,
      subMods: [],
      maps: [],
    }));
  }

  return parseWorkshopItems(workshopPath, itemIds);
}

export function createConfigRouter(configPath?: string): express.Router {
  const router = express.Router();

  router.get("/config", async (req, res) => {
    try {
      const serversConfig = await loadServersConfig({ cliConfigPath: configPath });
      const targetServer = resolveConfigServer(serversConfig, req);
      const data = await readConfig(targetServer.iniPath);
      const workshopItems = await buildWorkshopItems(
        serversConfig.global.workshopPath,
        data.items,
      );

      res.json({
        ...data,
        serverId: targetServer.id,
        workshopItems,
      });
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.put("/config", async (req, res) => {
    try {
      const serversConfig = await loadServersConfig({ cliConfigPath: configPath });
      const targetServer = resolveConfigServer(serversConfig, req);
      const data = await saveConfig(targetServer.iniPath, req.body);
      res.json({ ...data, serverId: targetServer.id });
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.get("/workshop-poster", async (req, res) => {
    try {
      const serversConfig = await loadServersConfig({ cliConfigPath: configPath });

      if (!serversConfig.global.workshopPath) {
        throw new AppError("BAD_REQUEST", "Workshop path is not configured");
      }

      const rel = typeof req.query.rel === "string" ? req.query.rel : "";
      const legacyPath = typeof req.query.path === "string" ? req.query.path : "";

      if (!rel && !legacyPath) {
        throw new AppError("BAD_REQUEST", "rel parameter is required");
      }

      const rootAbs = resolve(serversConfig.global.workshopPath);
      const candidateAbs = rel ? resolve(rootAbs, rel) : resolve(legacyPath);

      const relToRoot = relative(rootAbs, candidateAbs).replace(/\\/g, "/");
      const isUnderRoot = !!relToRoot && relToRoot !== ".." && !relToRoot.startsWith("../");
      if (!isUnderRoot) {
        throw new AppError("BAD_REQUEST", "Invalid poster path");
      }

      try {
        const fileStat = await stat(candidateAbs);
        if (!fileStat.isFile()) {
          throw new AppError("NOT_FOUND", "Poster file not found");
        }
      } catch {
        throw new AppError("NOT_FOUND", "Poster file not found");
      }

      res.sendFile(candidateAbs);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.delete("/workshop-items/:itemId", async (req, res) => {
    try {
      const serversConfig = await loadServersConfig({ cliConfigPath: configPath });

      if (!serversConfig.global.workshopPath) {
        throw new AppError("BAD_REQUEST", "Workshop path is not configured");
      }

      const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
      const result = await removeWorkshopItemDirectory(
        serversConfig.global.workshopPath,
        itemId,
      );

      res.json({ ok: true, removed: result.removed });
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.get("/paths", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath: configPath });
      const serverId = getServerIdQuery(req);
      res.json(toLegacyPathsConfig(config, serverId));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.put("/paths", async (req, res) => {
    try {
      const payload = validateLegacyPathsPayload(req.body);
      const currentConfig = await loadServersConfig({ cliConfigPath: configPath });
      const nextConfig = applyLegacyPathsConfig(currentConfig, payload);
      const savedConfig = await saveServersConfig(nextConfig);

      res.json({
        ok: true,
        paths: toLegacyPathsConfig(savedConfig),
      });
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  return router;
}
