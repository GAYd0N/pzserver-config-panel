export async function fetchConfig(serverId) {
  const response = await fetch(`/api/config?serverId=${encodeURIComponent(serverId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load config: ${response.status}`);
  }
  return response.json();
}

export async function saveConfig(serverId, items) {
  const response = await fetch(`/api/config?serverId=${encodeURIComponent(serverId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 409) throw new Error("文件被占用");
    throw new Error(data.error?.message || `保存失败: ${response.status}`);
  }
  return data;
}

export async function fetchServersConfig() {
  const response = await fetch("/api/servers-config");
  if (!response.ok) throw new Error(`Failed to load config: ${response.status}`);
  return response.json();
}

export async function fetchRuntimeSnapshot() {
  const response = await fetch("/api/servers/runtime");
  if (!response.ok) throw new Error(`Failed to load runtime: ${response.status}`);
  return response.json();
}

export async function startServerAPI(serverId) {
  const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}/start`, {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "启动失败");
  return data;
}

export async function stopServerAPI(serverId) {
  const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}/stop`, {
    method: "POST",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "停止失败");
  return data;
}

export async function updateGlobalConfig(globalConfig) {
  const response = await fetch("/api/global-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(globalConfig),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to update global config: ${response.status}`);
  }
  return response.json();
}

export async function fetchCommandSuggestions(prefix) {
  const response = await fetch(`/api/terminal/commands?prefix=${encodeURIComponent(prefix)}`);
  if (!response.ok) return [];
  return response.json();
}

export async function sendTerminalCommands(serverId, text) {
  const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}/terminal/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "发送失败");
  return data;
}

export async function createServer(serverData) {
  const response = await fetch("/api/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to create server: ${response.status}`);
  }
  return response.json();
}

export async function updateServer(serverId, serverData) {
  const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to update server: ${response.status}`);
  }
  return response.json();
}

export async function deleteServer(serverId) {
  const response = await fetch(`/api/servers/${encodeURIComponent(serverId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Failed to delete server: ${response.status}`);
  }
}
