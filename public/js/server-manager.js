import { state } from "./state.js";
import { showToast, getStatusText } from "./utils.js";
import { fetchServersConfig, fetchRuntimeSnapshot, startServerAPI, stopServerAPI, updateGlobalConfig } from "./api.js";
import { reconnectTerminal } from "./terminal.js";

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

  startBtn.disabled = isRunning || isAnotherRunning || isStartingOrStopping;
  stopBtn.disabled = !isRunning || isStartingOrStopping;
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

export async function startServer() {
  if (!state.currentServerId) return;

  const btn = document.getElementById("startServerBtn");
  btn.disabled = true;
  showToast("正在启动服务器...", "info");

  try {
    state.runtimeSnapshot = await startServerAPI(state.currentServerId);
    showToast("服务器启动成功", "success");
    updateControlPanel();
    reconnectTerminal();
  } catch (error) {
    showToast("启动失败: " + error.message, "error");
  } finally {
    btn.disabled = false;
  }
}

export async function stopServer() {
  if (!state.currentServerId) return;

  const btn = document.getElementById("stopServerBtn");
  btn.disabled = true;
  showToast("正在停止服务器...", "info");

  try {
    state.runtimeSnapshot = await stopServerAPI(state.currentServerId);
    showToast("服务器停止成功", "success");
    updateControlPanel();
  } catch (error) {
    showToast("停止失败: " + error.message, "error");
  }
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
