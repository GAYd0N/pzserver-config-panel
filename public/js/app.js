import { state } from "./state.js";
import { showToast, getUrlParam } from "./utils.js";
import { initTheme } from "./theme.js";
import { loadConfig, renderConfig, saveConfigHandler, toggleCollapse } from "./config.js";
import { addListItem, hideDialog, confirmAddItem, autoSortMods } from "./mods.js";
import { reconnectTerminal, clearTerminal, sendCommands, handleTerminalInput, handleTerminalChange, hideSuggestions } from "./terminal.js";
import { loadServersConfig, loadRuntimeStatus, startServer, stopServer, saveGlobalConfig } from "./server-manager.js";

function switchTab(tabName) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.remove("active");
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });

  document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`${tabName}-tab`).classList.add("active");

  if (tabName === "config" || tabName === "mods") {
    loadConfig();
  }
}

function goBack() {
  window.location.href = "/instance-select.html";
}

async function init() {
  initTheme();

  state.currentServerId = getUrlParam("serverId");

  if (!state.currentServerId) {
    showToast("未指定服务器实例，正在返回选择页面...", "error");
    setTimeout(goBack, 2000);
    return;
  }

  const loaded = await loadServersConfig();
  if (!loaded) {
    setTimeout(goBack, 2000);
    return;
  }

  await loadRuntimeStatus();

  setInterval(loadRuntimeStatus, 2000);

  document.getElementById("backButton").addEventListener("click", goBack);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  document.getElementById("saveButton").addEventListener("click", saveConfigHandler);

  const autoSortBtn = document.getElementById("autoSortBtn");
  if (autoSortBtn) {
    autoSortBtn.addEventListener("click", autoSortMods);
  }

  document.getElementById("startServerBtn").addEventListener("click", startServer);
  document.getElementById("stopServerBtn").addEventListener("click", stopServer);

  document.getElementById("autoScrollToggle").addEventListener("change", (e) => {
    state.autoScroll = e.target.checked;
  });
  document.getElementById("clearTerminalBtn").addEventListener("click", clearTerminal);
  document.getElementById("reconnectTerminalBtn").addEventListener("click", reconnectTerminal);
  document.getElementById("sendCommandBtn").addEventListener("click", sendCommands);

  const terminalInput = document.getElementById("terminalInput");
  terminalInput.addEventListener("keydown", handleTerminalInput);
  terminalInput.addEventListener("input", handleTerminalChange);

  document.getElementById("saveGlobalConfigBtn").addEventListener("click", saveGlobalConfig);

  document.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => {
      addListItem(button.dataset.type);
    });
  });

  document.querySelectorAll(".collapse-button").forEach((button) => {
    button.addEventListener("click", () => {
      toggleCollapse(button.dataset.target);
    });
  });

  document.getElementById("closeDialog").addEventListener("click", hideDialog);
  document.getElementById("cancelDialog").addEventListener("click", hideDialog);
  document.getElementById("confirmDialog").addEventListener("click", confirmAddItem);

  document.getElementById("addItemDialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      hideDialog();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideDialog();
      hideSuggestions();
    }
  });

  document.getElementById("dialogInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      confirmAddItem();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
