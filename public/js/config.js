import { state } from "./state.js";
import { showToast } from "./utils.js";
import { fetchConfig, saveConfig as saveConfigAPI } from "./api.js";
import { renderMods, renderWorkshopItems, renderMap } from "./mods.js";

const ITEM_GROUPS_LABELS = {
  basic: "服务器基本设置",
  pvp: "PVP设置",
  safehouse: "安全屋设置",
  chat: "聊天设置",
  player: "玩家设置",
  anticheat: "反作弊设置",
  performance: "性能设置",
};

const ITEM_GROUPS = {
  basic: {
    keys: ["Public", "PublicName", "PublicDescription", "MaxPlayers", "DefaultPort", "UDPPort", "RCONPort", "RCONPassword", "Password", "ServerWelcomeMessage", "ServerImageLoginScreen", "ServerImageLoadingScreen", "ServerImageIcon", "UPnP"]
  },
  pvp: {
    keys: ["PVP", "PVPLogToolChat", "PVPLogToolFile", "SafetySystem", "ShowSafety", "SafetyToggleTimer", "SafetyCooldownTimer", "SafetyDisconnectDelay", "WarStartDelay", "WarDuration", "WarSafehouseHitPoints", "PVPMeleeWhileHitReaction", "PVPMeleeDamageModifier", "PVPFirearmDamageModifier"]
  },
  safehouse: {
    keys: ["PlayerSafehouse", "AdminSafehouse", "SafehouseAllowTrepass", "SafehouseAllowFire", "SafehouseAllowLoot", "SafehouseAllowRespawn", "SafehouseDaySurvivedToClaim", "SafeHouseRemovalTime", "SafehouseAllowNonResidential", "SafehouseDisableDisguises", "MaxSafezoneSize", "DisableSafehouseWhenPlayerConnected"]
  },
  chat: {
    keys: ["GlobalChat", "ChatStreams", "DiscordEnable", "DiscordToken", "DiscordChannel", "DiscordChannelID", "WebhookAddress", "ChatMessageCharacterLimit", "ChatMessageSlowModeTime", "BadWordListFile", "GoodWordListFile", "BadWordPolicy", "BadWordReplacement"]
  },
  player: {
    keys: ["Open", "AutoCreateUserInWhiteList", "DisplayUserName", "ShowFirstAndLastName", "UsernameDisguises", "HideDisguisedUserName", "SpawnPoint", "SpawnItems", "DropOffWhiteListAfterDeath", "AllowCoop", "SleepAllowed", "SleepNeeded", "KnockedDownAllowed", "SneakModeHideFromOtherPlayers", "PlayerRespawnWithSelf", "PlayerRespawnWithOther", "FastForwardMultiplier", "AllowNonAsciiUsername", "MouseOverToSeeDisplayName", "HidePlayersBehindYou", "MapRemotePlayerVisibility", "Faction", "FactionDaySurvivedToCreate", "FactionPlayersRequiredForTag"]
  },
  anticheat: {
    keys: ["AntiCheatSafety", "AntiCheatMovement", "AntiCheatHit", "AntiCheatPacket", "AntiCheatPermission", "AntiCheatXP", "AntiCheatFire", "AntiCheatSafeHouse", "AntiCheatRecipe", "AntiCheatPlayer", "AntiCheatChecksum", "AntiCheatItem", "AntiCheatServerCustomization", "DoLuaChecksum", "SteamVAC"]
  },
  performance: {
    keys: ["PauseEmpty", "SaveWorldEveryMinutes", "DenyLoginOnOverloadedServer", "LoginQueueEnabled", "LoginQueueConnectTimeout", "ItemNumbersLimitPerContainer", "BloodSplatLifespanDays", "BackupsCount", "BackupsOnStart", "BackupsOnVersionChange", "BackupsPeriod", "MultiplayerStatisticsPeriod", "RemovePlayerCorpsesOnCorpseRemoval"]
  }
};

export function renderConfig() {
  if (!state.configData) return;

  state.normalItems = [];
  state.modsItems = [];
  state.workshopItemsItems = [];
  state.workshopItemsData = state.configData.workshopItems || [];
  state.mapItems = [];
  state.groupedNormalItems = {};

  state.configData.items.forEach((item) => {
    if (item.key === "Mods") {
      state.modsItems = item.value ? item.value.split(";").map((s) => s.trim()).filter((s) => s) : [];
    } else if (item.key === "WorkshopItems") {
      state.workshopItemsItems = item.value ? item.value.split(";").map((s) => s.trim()).filter((s) => s) : [];
    } else if (item.key === "Map") {
      state.mapItems = item.value ? item.value.split(";").map((s) => s.trim()).filter((s) => s) : [];
    } else {
      state.normalItems.push(item);
    }
  });

  Object.keys(ITEM_GROUPS_LABELS).forEach(groupKey => {
    state.groupedNormalItems[groupKey] = [];
  });
  state.groupedNormalItems.other = [];

  state.normalItems.forEach(item => {
    let assigned = false;
    for (const groupKey in ITEM_GROUPS) {
      if (ITEM_GROUPS[groupKey].keys.includes(item.key)) {
        state.groupedNormalItems[groupKey].push(item);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      state.groupedNormalItems.other.push(item);
    }
  });

  renderNormalItems();
  renderMods();
  renderWorkshopItems();
  renderMap();
}

export function renderNormalItems() {
  const container = document.getElementById("normalItemsList");
  container.innerHTML = "";

  Object.keys(ITEM_GROUPS_LABELS).forEach(groupKey => {
    const groupItems = state.groupedNormalItems[groupKey];
    if (groupItems && groupItems.length > 0) {
      renderItemGroup(container, groupKey, ITEM_GROUPS_LABELS[groupKey], groupItems);
    }
  });

  const otherItems = state.groupedNormalItems.other;
  if (otherItems && otherItems.length > 0) {
    renderItemGroup(container, "other", "其他设置", otherItems);
  }
}

function renderItemGroup(container, groupKey, groupName, items) {
  const groupDiv = document.createElement("div");
  groupDiv.className = "config-group";

  const groupHeader = document.createElement("div");
  groupHeader.className = "group-header";

  const groupTitle = document.createElement("h3");
  groupTitle.className = "group-title";
  groupTitle.textContent = groupName;
  groupHeader.appendChild(groupTitle);

  const collapseButton = document.createElement("button");
  collapseButton.className = "collapse-button";
  collapseButton.textContent = "▼";
  collapseButton.dataset.target = `group-${groupKey}-content`;
  collapseButton.addEventListener("click", () => toggleCollapse(collapseButton.dataset.target));
  groupHeader.appendChild(collapseButton);

  groupDiv.appendChild(groupHeader);

  const groupContent = document.createElement("div");
  groupContent.id = `group-${groupKey}-content`;
  groupContent.className = "group-content";

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "config-item";

    const label = document.createElement("div");
    label.className = "item-label" + (item.isKnown ? "" : " unknown");
    label.textContent = item.isKnown ? `${item.zhName} (${item.key})` : item.key;
    div.appendChild(label);

    if (item.description) {
      const desc = document.createElement("div");
      desc.className = "item-description";
      desc.textContent = item.description;
      div.appendChild(desc);
    }

    const isBooleanValue = item.value === "true" || item.value === "false";

    if (isBooleanValue) {
      const toggleContainer = document.createElement("div");
      toggleContainer.className = "toggle-container";

      const toggle = document.createElement("label");
      toggle.className = "toggle";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.value === "true";
      input.dataset.key = item.key;
      input.addEventListener("change", () => { state.isDirty = true; });
      toggle.appendChild(input);

      const span = document.createElement("span");
      span.className = "toggle-slider";
      toggle.appendChild(span);

      toggleContainer.appendChild(toggle);
      div.appendChild(toggleContainer);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "item-input";
      input.value = item.value;
      input.dataset.key = item.key;
      input.addEventListener("input", () => { state.isDirty = true; });
      div.appendChild(input);
    }

    groupContent.appendChild(div);
  });

  groupDiv.appendChild(groupContent);
  container.appendChild(groupDiv);
}

export function gatherConfigItems() {
  const items = [];

  const normalInputs = document.querySelectorAll("#normalItemsList .item-input");
  normalInputs.forEach((input) => {
    items.push({ key: input.dataset.key, value: input.value });
  });

  const toggleInputs = document.querySelectorAll("#normalItemsList .toggle input[type='checkbox']");
  toggleInputs.forEach((input) => {
    items.push({ key: input.dataset.key, value: input.checked ? "true" : "false" });
  });

  items.push({ key: "Mods", value: state.modsItems.filter((s) => s).join(";") });
  items.push({ key: "WorkshopItems", value: state.workshopItemsItems.filter((s) => s).join(";") });
  items.push({ key: "Map", value: state.mapItems.filter((s) => s).join(";") });

  return items;
}

export async function saveConfigHandler() {
  const saveButton = document.getElementById("saveButton");
  saveButton.disabled = true;
  showToast("保存中...", "info");

  try {
    const items = gatherConfigItems();
    await saveConfigAPI(state.currentServerId, items);
    state.isDirty = false;
    showToast("保存成功", "success");
    await loadConfig();
  } catch (error) {
    showToast("保存失败: " + error.message, "error");
    console.error(error);
  } finally {
    saveButton.disabled = false;
  }
}

let _autoSaving = false;

async function autoSave() {
  if (!state.currentServerId || !state.isDirty || _autoSaving) return;
  _autoSaving = true;
  try {
    const items = gatherConfigItems();
    await saveConfigAPI(state.currentServerId, items);
    state.isDirty = false;
  } catch {
    // silent on auto-save failure
  } finally {
    _autoSaving = false;
  }
}

let _autoSaveTimer = null;

function startAutoSave() {
  if (_autoSaveTimer) return;
  _autoSaveTimer = setInterval(autoSave, 30000);
}

export async function loadConfig() {
  try {
    if (!state.currentServerId) {
      showToast("未选择服务器实例", "error");
      return;
    }
    state.configData = await fetchConfig(state.currentServerId);
    state.isDirty = false;
    renderConfig();
    startAutoSave();
  } catch (error) {
    showToast("配置加载失败: " + error.message, "error");
    console.error(error);
  }
}

export function toggleCollapse(targetId) {
  const content = document.getElementById(targetId);
  const button = document.querySelector(`.collapse-button[data-target="${targetId}"]`);
  if (content && button) {
    const isCollapsed = content.style.display === "none";
    content.style.display = isCollapsed ? "block" : "none";
    button.textContent = isCollapsed ? "▼" : "▶";
  }
}
