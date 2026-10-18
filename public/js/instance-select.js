import { showToast, escapeHtml, getStatusText } from "./utils.js";
import { initTheme } from "./theme.js";
import {
  fetchServersConfig,
  fetchRuntimeSnapshot,
  createServer,
  updateServer,
  deleteServer,
  updateGlobalConfig,
  startServerAPI,
  stopServerAPI,
  forceStopServerAPI,
  restartServerAPI,
} from "./api.js";
import { confirmAction } from "./confirm-dialog.js";

let serversConfig = null;
let runtimeSnapshot = null;
let currentEditingServerId = null;

// ===== Loading =====

function showLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (show) {
    overlay.classList.add("active");
  } else {
    overlay.classList.remove("active");
  }
}

// ===== Data Loading =====

async function loadData() {
  try {
    showLoading(true);
    const [config, runtime] = await Promise.all([
      fetchServersConfig(),
      fetchRuntimeSnapshot(),
    ]);
    serversConfig = config;
    runtimeSnapshot = runtime;
    renderServers();
  } catch (error) {
    showToast("加载数据失败: " + error.message, "error");
    console.error(error);
  } finally {
    showLoading(false);
  }
}

// ===== Rendering =====

function getServerStatus(serverId) {
  if (!runtimeSnapshot) return "unknown";
  const serverState = runtimeSnapshot.servers.find((s) => s.serverId === serverId);
  return serverState?.status || "unknown";
}

function renderServers() {
  const grid = document.getElementById("serversGrid");

  if (!serversConfig || serversConfig.servers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🎮</div>
        <h3>暂无服务器实例</h3>
        <p>点击下方的"添加新实例"按钮创建你的第一个服务器</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = serversConfig.servers.map((server) => {
    const status = getServerStatus(server.id);
    const isRunning = status === "running";
    const isActive = status === "running" || status === "starting" || status === "stopping";
    const anotherServerActive = runtimeSnapshot?.activeServerId && runtimeSnapshot.activeServerId !== server.id;
    const canStart = !isActive && !anotherServerActive;

    return `
      <div class="server-card ${status}" data-server-id="${server.id}">
        <div class="server-card-header">
          <h3 class="server-card-name">${escapeHtml(server.name)}</h3>
          <span class="server-card-status ${status}">
            <span class="status-dot"></span>
            ${getStatusText(status)}
          </span>
        </div>
        <div class="server-card-path">${escapeHtml(server.iniPath)}</div>
        <div class="server-card-actions">
          <button class="server-card-btn primary manage-btn" data-server-id="${server.id}">
            进入管理
          </button>
        </div>
        <div class="server-card-actions server-card-controls">
          <button class="server-card-btn compact start server-control-btn" data-server-id="${server.id}" data-action="start" ${canStart ? "" : "disabled"}>
            启动
          </button>
          <button class="server-card-btn compact stop server-control-btn" data-server-id="${server.id}" data-action="stop" ${isRunning ? "" : "disabled"}>
            停止
          </button>
          <button class="server-card-btn compact force-stop server-control-btn" data-server-id="${server.id}" data-action="force-stop" ${isActive ? "" : "disabled"}>
            强制停止
          </button>
          <button class="server-card-btn compact restart server-control-btn" data-server-id="${server.id}" data-action="restart" ${isRunning ? "" : "disabled"}>
            重启
          </button>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".server-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const serverId = card.dataset.serverId;
      manageServer(serverId);
    });
  });

  grid.querySelectorAll(".manage-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const serverId = btn.dataset.serverId;
      manageServer(serverId);
    });
  });

  grid.querySelectorAll(".server-control-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const serverId = btn.dataset.serverId;
      const action = btn.dataset.action;

      if (action === "start") {
        startServerHandler(serverId);
      } else if (action === "stop") {
        stopServerHandler(serverId);
      } else if (action === "force-stop") {
        forceStopServerHandler(serverId);
      } else if (action === "restart") {
        restartServerHandler(serverId);
      }
    });
  });
}

// ===== Server Operations =====

function manageServer(serverId) {
  window.location.href = `/index.html?serverId=${encodeURIComponent(serverId)}`;
}

async function startServerHandler(serverId) {
  const confirmed = await confirmAction({
    title: "确认启动服务器",
    message: `确定要启动实例“${getServerLabel(serverId)}”吗？\n同一时间只能运行一个服务器实例。`,
    confirmText: "启动",
  });
  if (!confirmed) return;

  await runServerAction(
    () => startServerAPI(serverId),
    "服务器启动成功",
    "启动失败: ",
  );
}

async function stopServerHandler(serverId) {
  const confirmed = await confirmAction({
    title: "确认停止服务器",
    message: `确定要停止实例“${getServerLabel(serverId)}”吗？\n将发送停止命令并等待服务器保存后退出。`,
    confirmText: "停止",
    danger: true,
  });
  if (!confirmed) return;

  await runServerAction(
    () => stopServerAPI(serverId),
    "服务器停止成功",
    "停止失败: ",
  );
}

async function forceStopServerHandler(serverId) {
  const confirmed = await confirmAction({
    title: "确认强制停止",
    message: `确定要强制停止实例“${getServerLabel(serverId)}”吗？\n将立即终止服务器进程，未保存的游戏进度可能丢失，此操作不可撤销。`,
    confirmText: "强制停止",
    danger: true,
  });
  if (!confirmed) return;

  await runServerAction(
    () => forceStopServerAPI(serverId),
    "服务器已强制停止",
    "强制停止失败: ",
  );
}

async function restartServerHandler(serverId) {
  const confirmed = await confirmAction({
    title: "确认重启服务器",
    message: `确定要重启实例“${getServerLabel(serverId)}”吗？\n服务器将先停止再重新启动，期间玩家会断开连接。`,
    confirmText: "重启",
  });
  if (!confirmed) return;

  await runServerAction(
    () => restartServerAPI(serverId),
    "服务器重启成功",
    "重启失败: ",
  );
}

function getServerLabel(serverId) {
  return serversConfig?.servers.find((server) => server.id === serverId)?.name || serverId;
}

async function runServerAction(request, successMessage, failurePrefix) {
  try {
    showLoading(true);
    await request();
    showToast(successMessage, "success");
    await loadData();
  } catch (error) {
    showToast(failurePrefix + error.message, "error");
  } finally {
    showLoading(false);
  }
}

// ===== Dialog Management =====

function openServerDialog(serverId = null) {
  const dialog = document.getElementById("serverDialog");
  const title = document.getElementById("serverDialogTitle");
  const deleteBtn = document.getElementById("deleteServerBtn");

  currentEditingServerId = serverId;

  if (serverId) {
    const server = serversConfig.servers.find((s) => s.id === serverId);
    if (!server) return;

    title.textContent = "编辑服务器实例";
    document.getElementById("serverDialogId").value = server.id;
    document.getElementById("serverNameInput").value = server.name;
    document.getElementById("serverIniPathInput").value = server.iniPath;
    document.getElementById("serverStartArgsInput").value = server.startArgs.join("\n");
    document.getElementById("serverStopCmdsInput").value = server.stopCommands.join("\n");
    deleteBtn.style.display = "block";
  } else {
    title.textContent = "添加服务器实例";
    document.getElementById("serverDialogId").value = "";
    document.getElementById("serverNameInput").value = "";
    document.getElementById("serverIniPathInput").value = "";
    document.getElementById("serverStartArgsInput").value = "";
    document.getElementById("serverStopCmdsInput").value = "save\nquit";
    deleteBtn.style.display = "none";
  }

  dialog.classList.add("active");
}

function closeServerDialog() {
  document.getElementById("serverDialog").classList.remove("active");
  currentEditingServerId = null;
}

async function saveServer() {
  const name = document.getElementById("serverNameInput").value.trim();
  const iniPath = document.getElementById("serverIniPathInput").value.trim();
  const startArgsText = document.getElementById("serverStartArgsInput").value.trim();
  const stopCmdsText = document.getElementById("serverStopCmdsInput").value.trim();

  if (!name) { showToast("请输入实例名称", "error"); return; }
  if (!iniPath) { showToast("请输入 INI 配置文件路径", "error"); return; }
  if (!iniPath.endsWith(".ini")) { showToast("INI 路径必须以 .ini 结尾", "error"); return; }

  const startArgs = startArgsText
    ? startArgsText.split("\n").map((line) => line.trim()).filter(Boolean)
    : undefined;

  const stopCommands = stopCmdsText
    ? stopCmdsText.split("\n").map((line) => line.trim()).filter(Boolean)
    : ["save", "quit"];

  const serverData = { name, iniPath, startArgs, stopCommands };

  try {
    showLoading(true);

    if (currentEditingServerId) {
      await updateServer(currentEditingServerId, serverData);
      showToast("服务器实例更新成功", "success");
    } else {
      await createServer(serverData);
      showToast("服务器实例创建成功", "success");
    }

    closeServerDialog();
    await loadData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    showLoading(false);
  }
}

async function deleteServerHandler() {
  if (!currentEditingServerId) return;

  const serverName = serversConfig?.servers.find((server) => server.id === currentEditingServerId)?.name || currentEditingServerId;
  const confirmed = await confirmAction({
    title: "删除服务器实例",
    message: `确定要删除实例“${serverName}”吗？\n此操作只会移除面板中的实例配置，不会删除实际的 INI 文件，但操作不可撤销。`,
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) return;

  try {
    showLoading(true);
    await deleteServer(currentEditingServerId);
    showToast("服务器实例已删除", "success");
    closeServerDialog();
    await loadData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    showLoading(false);
  }
}

// ===== Global Settings Dialog =====

function openGlobalSettingsDialog() {
  if (!serversConfig) return;

  document.getElementById("globalWorkshopPath").value = serversConfig.global.workshopPath || "";
  document.getElementById("globalStartScriptPath").value = serversConfig.global.startScriptPath || "";
  document.getElementById("globalStopGraceTimeout").value = serversConfig.global.stopGraceTimeoutMs || 45000;
  document.getElementById("globalForceKillTimeout").value = serversConfig.global.forceKillTimeoutMs || 10000;

  document.getElementById("globalSettingsDialog").classList.add("active");
}

function closeGlobalSettingsDialog() {
  document.getElementById("globalSettingsDialog").classList.remove("active");
}

async function saveGlobalSettings() {
  const globalConfig = {
    workshopPath: document.getElementById("globalWorkshopPath").value.trim(),
    startScriptPath: document.getElementById("globalStartScriptPath").value.trim(),
    stopGraceTimeoutMs: parseInt(document.getElementById("globalStopGraceTimeout").value, 10) || 45000,
    forceKillTimeoutMs: parseInt(document.getElementById("globalForceKillTimeout").value, 10) || 10000,
  };

  if (!globalConfig.startScriptPath) {
    showToast("请输入启动脚本路径", "error");
    return;
  }

  try {
    showLoading(true);
    await updateGlobalConfig(globalConfig);
    showToast("全局设置保存成功", "success");
    closeGlobalSettingsDialog();
    await loadData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    showLoading(false);
  }
}

// ===== Init =====

function init() {
  initTheme();

  loadData();

  setInterval(loadData, 5000);

  document.getElementById("globalSettingsBtn").addEventListener("click", openGlobalSettingsDialog);

  document.getElementById("addServerBtn").addEventListener("click", () => openServerDialog());

  document.getElementById("closeServerDialog").addEventListener("click", closeServerDialog);
  document.getElementById("cancelServerDialog").addEventListener("click", closeServerDialog);
  document.getElementById("confirmServerDialog").addEventListener("click", saveServer);
  document.getElementById("deleteServerBtn").addEventListener("click", deleteServerHandler);

  document.getElementById("closeGlobalSettingsDialog").addEventListener("click", closeGlobalSettingsDialog);
  document.getElementById("cancelGlobalSettingsDialog").addEventListener("click", closeGlobalSettingsDialog);
  document.getElementById("confirmGlobalSettingsDialog").addEventListener("click", saveGlobalSettings);

  document.getElementById("serverDialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeServerDialog();
  });

  document.getElementById("globalSettingsDialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeGlobalSettingsDialog();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
