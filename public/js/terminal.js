import { state } from "./state.js";
import { showToast, escapeHtml } from "./utils.js";
import { fetchCommandSuggestions as fetchSuggestions, sendTerminalCommands as sendCommandsAPI } from "./api.js";

// ===== Terminal SSE =====

export function reconnectTerminal() {
  if (state.terminalEventSource) {
    state.terminalEventSource.close();
    state.terminalEventSource = null;
  }

  const output = document.getElementById("terminalOutput");
  output.innerHTML = '';

  if (!state.currentServerId) return;

  const runtime = state.runtimeSnapshot?.servers?.find(s => s.serverId === state.currentServerId);
  if (!runtime || runtime.status !== "running") {
    addTerminalLine({ stream: "system", text: "服务器未运行，无法连接终端" });
    return;
  }

  const es = new EventSource(`/api/servers/${encodeURIComponent(state.currentServerId)}/terminal/stream`);

  es.onmessage = (event) => {
    try {
      const line = JSON.parse(event.data);
      addTerminalLine(line);
    } catch (e) {
      console.error("解析终端消息失败:", e);
    }
  };

  es.onerror = () => {
    addTerminalLine({ stream: "system", text: "终端连接断开，正在重连..." });
    es.close();
    setTimeout(reconnectTerminal, 3000);
  };

  state.terminalEventSource = es;
}

export function addTerminalLine(line) {
  const output = document.getElementById("terminalOutput");
  const div = document.createElement("div");
  div.className = "terminal-line " + line.stream;

  const timestamp = line.timestamp ? new Date(line.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  div.innerHTML = `<span class="timestamp">[${timestamp}]</span>${escapeHtml(line.text)}`;

  output.appendChild(div);

  if (state.autoScroll) {
    output.scrollTop = output.scrollHeight;
  }

  while (output.children.length > 2000) {
    output.removeChild(output.firstChild);
  }
}

export function clearTerminal() {
  const output = document.getElementById("terminalOutput");
  output.innerHTML = '';
}

// ===== Send Commands =====

export async function sendCommands() {
  const input = document.getElementById("terminalInput");
  const text = input.value.trim();

  if (!text || !state.currentServerId) return;

  const runtime = state.runtimeSnapshot?.servers?.find(s => s.serverId === state.currentServerId);
  if (!runtime || runtime.status !== "running") {
    showToast("服务器未运行，无法发送命令", "error");
    return;
  }

  try {
    const data = await sendCommandsAPI(state.currentServerId, text);

    if (data.successCount > 0) {
      input.value = "";
      hideCommandSuggestions();
    }

    if (data.errors && data.errors.length > 0) {
      showToast(`发送完成，${data.successCount} 行成功，${data.errors.length} 行失败`, "info");
    }
  } catch (error) {
    showToast("发送命令失败: " + error.message, "error");
  }
}

// ===== Command Autocomplete =====

async function fetchCommandSuggestions(prefix) {
  if (!prefix) {
    hideCommandSuggestions();
    return;
  }

  try {
    const suggestions = await fetchSuggestions(prefix);
    showCommandSuggestions(suggestions);
  } catch (e) {
    hideCommandSuggestions();
  }
}

function showCommandSuggestions(suggestions) {
  const container = document.getElementById("commandSuggestions");

  if (!suggestions || suggestions.length === 0) {
    hideCommandSuggestions();
    return;
  }

  state.commandSuggestions = suggestions;
  state.selectedSuggestionIndex = -1;

  container.innerHTML = suggestions.map((cmd, index) => `
    <div class="command-suggestion-item" data-index="${index}">
      <span class="command-suggestion-name">${escapeHtml(cmd.command)}</span>
      <span class="command-suggestion-desc">${escapeHtml(cmd.description || "")}</span>
    </div>
  `).join("");

  container.classList.add("active");

  container.querySelectorAll(".command-suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      const idx = parseInt(item.dataset.index);
      selectSuggestion(idx);
    });
  });
}

function hideCommandSuggestions() {
  const container = document.getElementById("commandSuggestions");
  container.classList.remove("active");
  state.commandSuggestions = [];
  state.selectedSuggestionIndex = -1;
}

function selectSuggestion(index) {
  const suggestion = state.commandSuggestions[index];
  if (!suggestion) return;

  const input = document.getElementById("terminalInput");
  const lines = input.value.split("\n");
  const lastLine = lines[lines.length - 1];

  const words = lastLine.split(/\s+/);
  words[words.length - 1] = suggestion.command;
  lines[lines.length - 1] = words.join(" ");

  input.value = lines.join("\n");
  hideCommandSuggestions();
  input.focus();
}

export function updateSuggestionSelection(delta) {
  const container = document.getElementById("commandSuggestions");
  if (!container.classList.contains("active")) return;

  const items = container.querySelectorAll(".command-suggestion-item");
  if (items.length === 0) return;

  state.selectedSuggestionIndex += delta;
  if (state.selectedSuggestionIndex < 0) state.selectedSuggestionIndex = items.length - 1;
  if (state.selectedSuggestionIndex >= items.length) state.selectedSuggestionIndex = 0;

  items.forEach((item, idx) => {
    item.classList.toggle("selected", idx === state.selectedSuggestionIndex);
  });
}

export function hideSuggestions() {
  hideCommandSuggestions();
}

export function getSelectedSuggestionIndex() {
  return state.selectedSuggestionIndex;
}

export function selectCurrentSuggestion() {
  if (state.selectedSuggestionIndex >= 0) {
    selectSuggestion(state.selectedSuggestionIndex);
  }
}

// ===== Terminal Input Handler =====

export function handleTerminalInput(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCommands();
  } else if (e.key === "Tab") {
    e.preventDefault();
    if (state.selectedSuggestionIndex >= 0) {
      selectSuggestion(state.selectedSuggestionIndex);
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    updateSuggestionSelection(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    updateSuggestionSelection(-1);
  } else if (e.key === "Escape") {
    hideCommandSuggestions();
  }
}

export function handleTerminalChange(e) {
  const lines = e.target.value.split("\n");
  const lastLine = lines[lines.length - 1];
  const words = lastLine.split(/\s+/);
  const lastWord = words[words.length - 1];

  clearTimeout(window._suggestionTimeout);
  window._suggestionTimeout = setTimeout(() => {
    fetchCommandSuggestions(lastWord);
  }, 200);
}
