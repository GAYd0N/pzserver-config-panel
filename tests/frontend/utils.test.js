// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { escapeHtml, getStatusText, getUrlParam } from "../../public/js/utils.js";

describe("utils.js", () => {
  describe("escapeHtml", () => {
    it("returns empty string for falsy input", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
      expect(escapeHtml("")).toBe("");
    });

    it("escapes HTML special characters", () => {
      expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(escapeHtml('"hello" & "world"')).toBe('"hello" &amp; "world"');
      expect(escapeHtml("a < b > c")).toBe("a &lt; b &gt; c");
    });

    it("returns plain text unchanged", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
      expect(escapeHtml("normal text 123")).toBe("normal text 123");
    });
  });

  describe("getStatusText", () => {
    it("maps status codes to Chinese labels", () => {
      expect(getStatusText("stopped")).toBe("已停止");
      expect(getStatusText("starting")).toBe("启动中");
      expect(getStatusText("running")).toBe("运行中");
      expect(getStatusText("stopping")).toBe("停止中");
      expect(getStatusText("error")).toBe("错误");
      expect(getStatusText("unknown")).toBe("未知");
    });

    it("returns raw status for unknown values", () => {
      expect(getStatusText("bogus")).toBe("bogus");
    });
  });

  describe("getUrlParam", () => {
    it("returns the parameter value from the URL", () => {
      Object.defineProperty(window, "location", {
        value: { search: "?serverId=my-server&tab=config" },
        writable: true,
        configurable: true,
      });
      expect(getUrlParam("serverId")).toBe("my-server");
      expect(getUrlParam("tab")).toBe("config");
    });

    it("returns null for missing params", () => {
      Object.defineProperty(window, "location", {
        value: { search: "?foo=bar" },
        writable: true,
        configurable: true,
      });
      expect(getUrlParam("serverId")).toBeNull();
    });
  });
});
