// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "../../public/js/api.js";

/**
 * @param {*} body
 * @param {boolean} [ok]
 * @param {number} [status]
 */
function mockResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe("api.js", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchConfig", () => {
    it("fetches config for a server", async () => {
      const data = { items: [{ key: "PublicName", value: "Test" }], workshopItems: [] };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.fetchConfig("server-1");
      expect(result).toEqual(data);
    });

    it("throws on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}, false, 500));

      await expect(api.fetchConfig("server-1")).rejects.toThrow("Failed to load config");
    });
  });

  describe("saveConfig", () => {
    it("saves config and returns data", async () => {
      const data = { success: true };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.saveConfig("server-1", [{ key: "Mods", value: "modA" }]);
      expect(result).toEqual(data);
    });

    it("throws specific message on 409 conflict", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse({}, false, 409));

      await expect(api.saveConfig("server-1", [])).rejects.toThrow("文件被占用");
    });
  });

  describe("fetchServersConfig", () => {
    it("fetches servers config", async () => {
      const data = { servers: [], global: {} };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.fetchServersConfig();
      expect(result).toEqual(data);
    });
  });

  describe("fetchRuntimeSnapshot", () => {
    it("fetches runtime snapshot", async () => {
      const data = { activeServerId: null, servers: [] };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.fetchRuntimeSnapshot();
      expect(result).toEqual(data);
    });
  });

  describe("startServerAPI", () => {
    it("starts a server", async () => {
      const data = { serverId: "server-1", status: "running" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.startServerAPI("server-1");
      expect(result).toEqual(data);
    });

    it("throws on failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockResponse({ error: { message: "already running" } }, false, 409),
      );

      await expect(api.startServerAPI("server-1")).rejects.toThrow("already running");
    });
  });

  describe("stopServerAPI", () => {
    it("stops a server", async () => {
      const data = { serverId: "server-1", status: "stopped" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.stopServerAPI("server-1");
      expect(result).toEqual(data);
    });
  });

  describe("sendTerminalCommands", () => {
    it("sends terminal commands", async () => {
      const data = { successCount: 2, errors: [] };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.sendTerminalCommands("server-1", "save\nquit");
      expect(result).toEqual(data);
    });
  });

  describe("fetchCommandSuggestions", () => {
    it("returns suggestions for a prefix", async () => {
      const data = [{ command: "save", description: "保存" }];
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.fetchCommandSuggestions("sa");
      expect(result).toEqual(data);
    });

    it("returns empty array on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(null, false, 500));

      const result = await api.fetchCommandSuggestions("sa");
      expect(result).toEqual([]);
    });
  });

  describe("createServer / updateServer / deleteServer", () => {
    it("creates a server instance", async () => {
      const data = { id: "new-server", name: "New" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.createServer({ name: "New", iniPath: "/tmp/test.ini" });
      expect(result).toEqual(data);
    });

    it("updates a server instance", async () => {
      const data = { id: "server-1", name: "Updated" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.updateServer("server-1", { name: "Updated" });
      expect(result).toEqual(data);
    });

    it("deletes a server instance", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(undefined));

      const result = await api.deleteServer("server-1");
      expect(result).toBeUndefined();
    });

    it("throws on create error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        mockResponse({ error: { message: "duplicate id" } }, false, 400),
      );

      await expect(api.createServer({ name: "X", iniPath: "/tmp/x.ini" })).rejects.toThrow("duplicate id");
    });
  });

  describe("updateGlobalConfig", () => {
    it("saves global config", async () => {
      const data = { workshopPath: "/ws" };
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse(data));

      const result = await api.updateGlobalConfig({ workshopPath: "/ws" });
      expect(result).toEqual(data);
    });
  });
});
