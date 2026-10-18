import express from "express";
import {
  loadServersConfig,
  saveServersConfig,
  getServerInstance,
  generateServerId,
} from "../config/servers-config.js";
import { AppError, toErrorResponse } from "../errors/app-error.js";
import type { ServerInstance, ServersConfig } from "../types/server.js";

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

export function createServersConfigRouter(cliConfigPath?: string): express.Router {
  const router = express.Router();

  // GET /api/servers-config - 获取完整配置
  router.get("/servers-config", async (_req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      res.json(config);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // PUT /api/servers-config - 更新完整配置
  router.put("/servers-config", async (req, res) => {
    try {
      const saved = await saveServersConfig(req.body);
      res.json(saved);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // GET /api/global-config - 获取全局配置
  router.get("/global-config", async (_req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      res.json(config.global);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // PUT /api/global-config - 更新全局配置
  router.put("/global-config", async (req, res) => {
    try {
      const currentConfig = await loadServersConfig({ cliConfigPath });
      const newConfig: ServersConfig = {
        ...currentConfig,
        global: req.body,
      };
      const saved = await saveServersConfig(newConfig);
      res.json(saved.global);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // GET /api/servers - 获取所有实例列表
  router.get("/servers", async (_req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      res.json(config.servers);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // POST /api/servers - 创建新实例
  router.post("/servers", async (req, res) => {
    try {
      const currentConfig = await loadServersConfig({ cliConfigPath });
      const existingIds = new Set(currentConfig.servers.map((s) => s.id));

      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        throw new AppError("BAD_REQUEST", "Server name is required");
      }

      const iniPath = typeof req.body.iniPath === "string" ? req.body.iniPath.trim() : "";
      if (!iniPath) {
        throw new AppError("BAD_REQUEST", "iniPath is required");
      }

      const newId = generateServerId(name, existingIds);
      const iniBaseName = iniPath.replace(/^.*[/\\]/, "").replace(/\.ini$/i, "");

      const newServer: ServerInstance = {
        id: newId,
        name: name,
        iniPath: iniPath,
        savePath: "",
        startArgs: Array.isArray(req.body.startArgs)
          ? req.body.startArgs.filter((arg: unknown): arg is string => typeof arg === "string")
          : ["-servername", iniBaseName],
        stopCommands: Array.isArray(req.body.stopCommands)
          ? req.body.stopCommands.filter((cmd: unknown): cmd is string => typeof cmd === "string")
          : ["save", "quit"],
        scheduledCommands: [],
      };

      const newConfig: ServersConfig = {
        ...currentConfig,
        servers: [...currentConfig.servers, newServer],
      };

      const saved = await saveServersConfig(newConfig);
      res.status(201).json(newServer);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // GET /api/servers/:id - 获取单个实例
  router.get("/servers/:id", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      res.json(server);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // PUT /api/servers/:id - 更新单个实例
  router.put("/servers/:id", async (req, res) => {
    try {
      const currentConfig = await loadServersConfig({ cliConfigPath });
      const serverIndex = currentConfig.servers.findIndex((s) => s.id === req.params.id);

      if (serverIndex === -1) {
        throw new AppError("NOT_FOUND", `Server instance not found: ${req.params.id}`);
      }

      const currentServer = currentConfig.servers[serverIndex];

      const updatedServer: ServerInstance = {
        ...currentServer,
        name: typeof req.body.name === "string" ? req.body.name.trim() : currentServer.name,
        iniPath: typeof req.body.iniPath === "string" ? req.body.iniPath.trim() : currentServer.iniPath,
        savePath: typeof req.body.savePath === "string"
          ? req.body.savePath.trim()
          : currentServer.savePath,
        startArgs: Array.isArray(req.body.startArgs)
          ? req.body.startArgs.filter((arg: unknown): arg is string => typeof arg === "string")
          : currentServer.startArgs,
        stopCommands: Array.isArray(req.body.stopCommands)
          ? req.body.stopCommands.filter((cmd: unknown): cmd is string => typeof cmd === "string")
          : currentServer.stopCommands,
        scheduledCommands: Array.isArray(req.body.scheduledCommands)
          ? req.body.scheduledCommands
          : currentServer.scheduledCommands,
      };

      const newServers = [...currentConfig.servers];
      newServers[serverIndex] = updatedServer;

      const newConfig: ServersConfig = {
        ...currentConfig,
        servers: newServers,
      };

      const saved = await saveServersConfig(newConfig);
      const savedServer = saved.servers.find((server) => server.id === updatedServer.id);
      res.json(savedServer ?? updatedServer);
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  // DELETE /api/servers/:id - 删除实例
  router.delete("/servers/:id", async (req, res) => {
    try {
      const currentConfig = await loadServersConfig({ cliConfigPath });
      const serverIndex = currentConfig.servers.findIndex((s) => s.id === req.params.id);

      if (serverIndex === -1) {
        throw new AppError("NOT_FOUND", `Server instance not found: ${req.params.id}`);
      }

      const newServers = currentConfig.servers.filter((s) => s.id !== req.params.id);

      const newConfig: ServersConfig = {
        ...currentConfig,
        servers: newServers,
      };

      await saveServersConfig(newConfig);
      res.status(204).send();
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  return router;
}
