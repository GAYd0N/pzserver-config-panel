import { state } from "./state.js";
import { showToast } from "./utils.js";
import {
  createServerBackupAPI,
  deleteServerBackupAPI,
  fetchServerBackups,
  updateServer,
} from "./api.js";
import { confirmAction } from "./confirm-dialog.js";

function getSavePathInput() {
  return document.getElementById("savePathInput");
}

function getBackupList() {
  return document.getElementById("backupList");
}

function getCurrentSavePath() {
  return typeof state.currentServer?.savePath === "string"
    ? state.currentServer.savePath
    : "";
}

export function formatBackupSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "--";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatBackupTime(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

export function updateBackupConfigUI() {
  const input = getSavePathInput();
  if (input) {
    input.value = getCurrentSavePath();
  }
}

function renderEmptyState(container, text) {
  const empty = document.createElement("p");
  empty.className = "backup-empty";
  empty.textContent = text;
  container.appendChild(empty);
}

function createBackupRow(backup) {
  const row = document.createElement("div");
  row.className = "backup-row";

  const info = document.createElement("div");
  info.className = "backup-info";

  const nameEl = document.createElement("span");
  nameEl.className = "backup-name";
  nameEl.textContent = backup.name;

  const metaEl = document.createElement("span");
  metaEl.className = "backup-meta";
  metaEl.textContent = `${formatBackupTime(backup.createdAt)} · ${formatBackupSize(backup.size)}`;

  info.append(nameEl, metaEl);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "backup-delete-button";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", () => deleteBackup(backup.name));

  row.append(info, deleteButton);
  return row;
}

export function renderBackups(backups) {
  const container = getBackupList();
  if (!container) return;

  container.innerHTML = "";

  if (!getCurrentSavePath()) {
    renderEmptyState(container, "请先设置存档文件夹");
    return;
  }

  if (!Array.isArray(backups) || backups.length === 0) {
    renderEmptyState(container, "暂无备份");
    return;
  }

  for (const backup of backups) {
    container.appendChild(createBackupRow(backup));
  }
}

export async function loadBackups() {
  const container = getBackupList();
  if (!container) return;

  if (!state.currentServerId) {
    renderBackups([]);
    return;
  }

  if (!getCurrentSavePath()) {
    renderBackups([]);
    return;
  }

  try {
    const backups = await fetchServerBackups(state.currentServerId);
    renderBackups(backups);
  } catch (error) {
    container.innerHTML = "";
    renderEmptyState(container, "加载备份列表失败");
    showToast("加载备份列表失败: " + error.message, "error");
  }
}

export async function saveSavePath() {
  if (!state.currentServerId) return;

  const input = getSavePathInput();
  const savePath = input ? input.value.trim() : "";
  const button = document.getElementById("saveSavePathBtn");
  if (button) button.disabled = true;

  try {
    const updated = await updateServer(state.currentServerId, { savePath });
    state.currentServer = {
      ...state.currentServer,
      ...updated,
      savePath: typeof updated.savePath === "string" ? updated.savePath : savePath,
    };
    if (input) input.value = state.currentServer.savePath;
    showToast("存档文件夹已保存", "success");
    await loadBackups();
  } catch (error) {
    showToast("保存存档文件夹失败: " + error.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

export async function createBackup() {
  if (!state.currentServerId) return;

  if (!getCurrentSavePath()) {
    showToast("请先设置存档文件夹", "error");
    return;
  }

  const button = document.getElementById("createBackupBtn");
  if (button) button.disabled = true;
  showToast("正在创建备份...", "info");

  try {
    const backup = await createServerBackupAPI(state.currentServerId);
    showToast(`备份已创建: ${backup.name}`, "success");
    await loadBackups();
  } catch (error) {
    showToast("创建备份失败: " + error.message, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

export async function deleteBackup(fileName) {
  if (!state.currentServerId) return;

  const confirmed = await confirmAction({
    title: "删除备份",
    message: `确定要删除备份“${fileName}”吗？此操作不可撤销。`,
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) return;

  try {
    await deleteServerBackupAPI(state.currentServerId, fileName);
    showToast("备份已删除", "success");
    await loadBackups();
  } catch (error) {
    showToast("删除备份失败: " + error.message, "error");
  }
}
