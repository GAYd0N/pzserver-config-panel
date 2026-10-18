// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state } from "../../public/js/state.js";
import {
  createBackup,
  formatBackupSize,
  formatBackupTime,
  loadBackups,
  refreshBackupStatus,
  renderBackupStatus,
  renderBackups,
} from "../../public/js/backups.js";

describe("backups.js", () => {
  let fetchMock;

  beforeEach(async () => {
    state.currentServerId = "main";
    state.currentServer = { id: "main", name: "Main", savePath: "/saves/main" };

    document.body.innerHTML = `
      <input id="savePathInput" />
      <button id="saveSavePathBtn"></button>
      <button id="createBackupBtn"></button>
      <span id="backupStatusDot"></span>
      <span id="backupStatusText"></span>
      <div id="backupList"></div>
      <div id="toastContainer"></div>
    `;

    fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });

    await refreshBackupStatus();
    fetchMock.mockClear();
  });

  afterEach(async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ running: false, startedAt: null }),
    });
    await refreshBackupStatus();
    vi.restoreAllMocks();
  });

  it("formats sizes and timestamps for the backup list", () => {
    expect(formatBackupSize(512)).toBe("512 B");
    expect(formatBackupSize(1536)).toBe("1.5 KB");
    expect(formatBackupSize(12 * 1024 * 1024)).toBe("12 MB");
    expect(formatBackupSize(-1)).toBe("--");
    expect(formatBackupTime("not-a-date")).toBe("--");
  });

  it("renders an empty state when no backups exist", () => {
    renderBackups([]);

    expect(document.querySelector(".backup-empty").textContent).toBe("暂无备份");
  });

  it("renders backup rows with name, time, and size", () => {
    renderBackups([
      {
        name: "Main-backup-2026-10-18-16-40-05.tar.gz",
        size: 2048,
        createdAt: "2026-10-18T08:40:05.000Z",
      },
    ]);

    expect(document.querySelector(".backup-name").textContent).toBe(
      "Main-backup-2026-10-18-16-40-05.tar.gz",
    );
    expect(document.querySelector(".backup-meta").textContent).toContain("2.0 KB");
    expect(document.querySelector(".backup-delete-button").textContent).toBe("删除");
  });

  it("loads backups from the API for the current instance", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([
        { name: "Main-backup-a.tar.gz", size: 10, createdAt: "2026-10-18T08:40:05.000Z" },
      ]),
    });

    await loadBackups();

    expect(fetchMock).toHaveBeenCalledWith("/api/servers/main/backups");
    expect(document.querySelectorAll(".backup-row")).toHaveLength(1);
  });

  it("shows a running status and disables backup creation", () => {
    renderBackupStatus({
      running: true,
      startedAt: "2026-10-18T09:04:02.000Z",
    });

    expect(document.getElementById("backupStatusText").textContent).toContain("正在创建备份");
    expect(document.getElementById("backupStatusDot").classList.contains("running")).toBe(true);
    expect(document.getElementById("createBackupBtn").disabled).toBe(true);
    expect(document.getElementById("createBackupBtn").textContent).toBe("备份中…");

    renderBackupStatus({ running: false, startedAt: null });

    expect(document.getElementById("backupStatusText").textContent).toBe("就绪");
    expect(document.getElementById("backupStatusDot").classList.contains("running")).toBe(false);
    expect(document.getElementById("createBackupBtn").disabled).toBe(false);
    expect(document.getElementById("createBackupBtn").textContent).toBe("立即备份");
  });

  it("does not start a new backup while another backup is running", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ running: true, startedAt: "2026-10-18T09:04:02.000Z" }),
    });
    await refreshBackupStatus();
    fetchMock.mockClear();

    await createBackup();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById("createBackupBtn").disabled).toBe(true);
  });

  it("shows a hint instead of fetching when no save folder is configured", async () => {
    state.currentServer.savePath = "";

    await loadBackups();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector(".backup-empty").textContent).toBe("请先设置存档文件夹");
  });
});
