import { showToast, escapeHtml, getStatusText } from "./utils.js";
import { initTheme } from "./theme.js";
import { fetchServersConfig, fetchRuntimeSnapshot, createServer, updateServer, deleteServer, updateGlobalConfig, startServerAPI, stopServerAPI } from "./api.js";

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
    const isRunning = status === "running" || status === "starting";

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
          <button class="server-card-btn secondary toggle-btn" data-server-id="${server.id}" ${isRunning ? '' : 'disabled'}>
            ${isRunning ? '停止' : '启动'}
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

  grid.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const serverId = btn.dataset.serverId;
      const status = getServerStatus(serverId);

      if (status === "running") {
        stopServerHandler(serverId);
      } else if (status === "stopped") {
        startServerHandler(serverId);
      }
    });
  });
}

// ===== Server Operations =====

function manageServer(serverId) {
  window.location.href = `/index.html?serverId=${encodeURIComponent(serverId)}`;
}

async function startServerHandler(serverId) {
  try {
    showLoading(true);
    await startServerAPI(serverId);
    showToast("服务器启动成功", "success");
    await loadData();
  } catch (error) {
    showToast("启动失败: " + error.message, "error");
  } finally {
    showLoading(false);
  }
}

async function stopServerHandler(serverId) {
  try {
    showLoading(true);
    await stopServerAPI(serverId);
    showToast("服务器停止成功", "success");
    await loadData();
  } catch (error) {
    showToast("停止失败: " + error.message, "error");
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

  if (!confirm("确定要删除此服务器实例吗？此操作不可恢复。")) return;

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
