import express from "express";

import { loadServersConfig } from "../config/servers-config.js";
import {
  createServerBackup,
  deleteServerBackup,
  listServerBackups,
} from "../backup/server-backup.js";
import { AppError, toErrorResponse } from "../errors/app-error.js";
import type { ServerInstance } from "../types/server.js";

function sendRouteError(error: unknown, res: express.Response): void {
  if (error instanceof AppError) {
    res.status(error.status).json(toErrorResponse(error));
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}

function resolveServerById(servers: ServerInstance[], id: string): ServerInstance {
  const normalized = id.trim();
  if (!normalized) {
    throw new AppError("BAD_REQUEST", "Server id is required");
  }

  const server = servers.find((item) => item.id === normalized);
  if (!server) {
    throw new AppError("NOT_FOUND", `Server instance not found: ${normalized}`);
  }

  return server;
}

export function createBackupsRouter(cliConfigPath?: string): express.Router {
  const router = express.Router();

  // GET /api/servers/:id/backups - 获取当前实例的备份列表
  router.get("/servers/:id/backups", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      res.json(await listServerBackups(server));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // POST /api/servers/:id/backups - 创建一次备份
  router.post("/servers/:id/backups", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      const backup = await createServerBackup(server);
      res.status(201).json(backup);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // DELETE /api/servers/:id/backups/:fileName - 删除指定备份
  router.delete("/servers/:id/backups/:fileName", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      await deleteServerBackup(server, req.params.fileName);
      res.status(204).send();
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  return router;
}
