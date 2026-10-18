import express from "express";
import { loadServersConfig } from "../config/servers-config.js";
import { AppError, toErrorResponse } from "../errors/app-error.js";
import {
  ServerRuntimeManager,
  type StopServerOptions,
} from "../runtime/manager.js";
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

function buildStopOptions(stopGraceTimeoutMs: number, forceKillTimeoutMs: number): StopServerOptions {
  return {
    stopGraceTimeoutMs,
    forceKillTimeoutMs,
  };
}

export function createServersRuntimeRouter(
  runtimeManager: ServerRuntimeManager,
  cliConfigPath?: string,
): express.Router {
  const router = express.Router();

  router.get("/servers/runtime", async (_req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      res.json(runtimeManager.getRuntimeSnapshot(config.servers));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.post("/servers/:id/start", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      await runtimeManager.startServer(server, config.global);
      res.json(runtimeManager.getRuntimeSnapshot(config.servers));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.post("/servers/:id/stop", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      const stopOptions = buildStopOptions(
        config.global.stopGraceTimeoutMs,
        config.global.forceKillTimeoutMs,
      );
      await runtimeManager.stopServer(server, stopOptions);
      res.json(runtimeManager.getRuntimeSnapshot(config.servers));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.post("/servers/:id/force-stop", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      await runtimeManager.forceStopServer(server, config.global.forceKillTimeoutMs);
      res.json(runtimeManager.getRuntimeSnapshot(config.servers));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  router.post("/servers/:id/restart", async (req, res) => {
    try {
      const config = await loadServersConfig({ cliConfigPath });
      const server = resolveServerById(config.servers, req.params.id);
      const stopOptions = buildStopOptions(
        config.global.stopGraceTimeoutMs,
        config.global.forceKillTimeoutMs,
      );
      await runtimeManager.restartServer(server, config.global, stopOptions);
      res.json(runtimeManager.getRuntimeSnapshot(config.servers));
    } catch (error) {
      sendRouteError(error, res);
    }
  });

  return router;
}
