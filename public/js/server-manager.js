import { state } from "./state.js";
import { showToast, getStatusText } from "./utils.js";
import {
  fetchServersConfig,
  fetchRuntimeSnapshot,
  startServerAPI,
  stopServerAPI,
  forceStopServerAPI,
  restartServerAPI,
  updateGlobalConfig,
} from "./api.js";
import { reconnectTerminal } from "./terminal.js";
import { confirmAction } from "./confirm-dialog.js";

// ===== Load Data =====

export async function loadServersConfig() {
  try {
    state.serversConfig = await fetchServersConfig();

    if (state.currentServerId) {
      state.currentServer = state.serversConfig.servers.find(s => s.id === state.currentServerId);
      if (!state.currentServer) {
        showToast("未找到指定的服务器实例", "error");
        return false;
      }
      updateHeaderInfo();
      updateInstanceInfo();
      updateGlobalConfigUI();
    }

    return true;
  } catch (error) {
    showToast("加载服务器配置失败: " + error.message, "error");
    return false;
  }
}

export async function loadRuntimeStatus() {
  try {
    state.runtimeSnapshot = await fetchRuntimeSnapshot();
    updateControlPanel();
  } catch (error) {
    console.error("加载运行状态失败:", error);
  }
}

// ===== UI Updates =====

export function updateHeaderInfo() {
  const headerName = document.getElementById("headerServerName");
  if (state.currentServer) {
    headerName.textContent = state.currentServer.name;
    document.title = `PZ Server Manager - ${state.currentServer.name}`;
  }
}

export function updateInstanceInfo() {
  if (!state.currentServer) return;

  document.getElementById("instanceId").textContent = state.currentServer.id;
  document.getElementById("instanceName").textContent = state.currentServer.name;
  document.getElementById("instanceIniPath").textContent = state.currentServer.iniPath;
  document.getElementById("instanceStartArgs").textContent = state.currentServer.startArgs.join(" ");
  document.getElementById("instanceStopCommands").textContent = state.currentServer.stopCommands.join(", ");
}

export function updateGlobalConfigUI() {
  if (!state.serversConfig || !state.serversConfig.global) return;

  const global = state.serversConfig.global;
  document.getElementById("workshopPath").value = global.workshopPath || "";
  document.getElementById("startScriptPath").value = global.startScriptPath || "";
  document.getElementById("stopGraceTimeout").value = global.stopGraceTimeoutMs || 45000;
  document.getElementById("forceKillTimeout").value = global.forceKillTimeoutMs || 10000;
}

export function updateControlPanel() {
  const runtime = state.runtimeSnapshot?.servers?.find(s => s.serverId === state.currentServerId);

  const statusEl = document.getElementById("selectedServerStatus");
  const startBtn = document.getElementById("startServerBtn");
  const stopBtn = document.getElementById("stopServerBtn");
  const forceStopBtn = document.getElementById("forceStopServerBtn");
  const restartBtn = document.getElementById("restartServerBtn");
  const infoEl = document.getElementById("controlInfo");
  const pidEl = document.getElementById("serverPid");
  const startedAtEl = document.getElementById("serverStartedAt");
  const sendBtn = document.getElementById("sendCommandBtn");

  const status = runtime?.status || "unknown";
  statusEl.textContent = getStatusText(status);
  statusEl.className = "server-status-badge " + status;

  const isRunning = status === "running";
  const isAnotherRunning = state.runtimeSnapshot?.activeServerId && state.runtimeSnapshot.activeServerId !== state.currentServerId;
  const isStartingOrStopping = status === "starting" || status === "stopping";
  const isActive = isRunning || isStartingOrStopping;

  startBtn.disabled = isRunning || isAnotherRunning || isStartingOrStopping;
  stopBtn.disabled = !isRunning;
  forceStopBtn.disabled = !isActive;
  restartBtn.disabled = !isRunning;
  sendBtn.disabled = !isRunning;

  if (isRunning && runtime) {
    infoEl.style.display = "flex";
    pidEl.textContent = runtime.pid || "--";
    startedAtEl.textContent = runtime.startedAt ? new Date(runtime.startedAt).toLocaleString() : "--";
  } else {
    infoEl.style.display = "none";
  }
}

// ===== Server Control =====

function getCurrentServerLabel() {
  return state.currentServer?.name || state.currentServerId || "当前实例";
}

async function runServerControl(buttonId, request, messages) {
  if (!state.currentServerId) return;

  const btn = document.getElementById(buttonId);
  if (btn) btn.disabled = true;
  showToast(messages.progress, "info");

  try {
    state.runtimeSnapshot = await request();
    showToast(messages.success, "success");
    updateControlPanel();
    if (messages.reconnectTerminal) {
      reconnectTerminal();
    }
  } catch (error) {
    showToast(messages.failure + error.message, "error");
  } finally {
    updateControlPanel();
  }
}

export async function startServer() {
  if (!state.currentServerId) return;

  const confirmed = await confirmAction({
    title: "确认启动服务器",
    message: `确定要启动实例“${getCurrentServerLabel()}”吗？\n同一时间只能运行一个服务器实例。`,
    confirmText: "启动",
  });
  if (!confirmed) return;

  await runServerControl("startServerBtn", () => startServerAPI(state.currentServerId), {
    progress: "正在启动服务器...",
    success: "服务器启动成功",
    failure: "启动失败: ",
    reconnectTerminal: true,
  });
}

export async function stopServer() {
  if (!state.currentServerId) return;

  const confirmed = await confirmAction({
    title: "确认停止服务器",
    message: `确定要停止实例“${getCurrentServerLabel()}”吗？\n将发送停止命令并等待服务器保存后退出。`,
    confirmText: "停止",
    danger: true,
  });
  if (!confirmed) return;

  await runServerControl("stopServerBtn", () => stopServerAPI(state.currentServerId), {
    progress: "正在停止服务器...",
    success: "服务器停止成功",
    failure: "停止失败: ",
  });
}

export async function forceStopServer() {
  if (!state.currentServerId) return;

  const confirmed = await confirmAction({
    title: "确认强制停止",
    message: `确定要强制停止实例“${getCurrentServerLabel()}”吗？\n将立即终止服务器进程，未保存的游戏进度可能丢失，此操作不可撤销。`,
    confirmText: "强制停止",
    danger: true,
  });
  if (!confirmed) return;

  await runServerControl("forceStopServerBtn", () => forceStopServerAPI(state.currentServerId), {
    progress: "正在强制停止服务器...",
    success: "服务器已强制停止",
    failure: "强制停止失败: ",
  });
}

export async function restartServer() {
  if (!state.currentServerId) return;

  const confirmed = await confirmAction({
    title: "确认重启服务器",
    message: `确定要重启实例“${getCurrentServerLabel()}”吗？\n服务器将先停止再重新启动，期间玩家会断开连接。`,
    confirmText: "重启",
  });
  if (!confirmed) return;

  await runServerControl("restartServerBtn", () => restartServerAPI(state.currentServerId), {
    progress: "正在重启服务器...",
    success: "服务器重启成功",
    failure: "重启失败: ",
    reconnectTerminal: true,
  });
}

// ===== Global Settings =====

export async function saveGlobalConfig() {
  const saveButton = document.getElementById("saveGlobalConfigBtn");
  saveButton.disabled = true;
  showToast("保存全局设置中...", "info");

  try {
    const globalConfig = {
      workshopPath: document.getElementById("workshopPath").value.trim(),
      startScriptPath: document.getElementById("startScriptPath").value.trim(),
      stopGraceTimeoutMs: parseInt(document.getElementById("stopGraceTimeout").value, 10) || 45000,
      forceKillTimeoutMs: parseInt(document.getElementById("forceKillTimeout").value, 10) || 10000,
    };

    state.serversConfig.global = await updateGlobalConfig(globalConfig);
    showToast("全局设置保存成功", "success");
  } catch (error) {
    showToast("保存失败: " + error.message, "error");
    console.error(error);
  } finally {
    saveButton.disabled = false;
  }
}
