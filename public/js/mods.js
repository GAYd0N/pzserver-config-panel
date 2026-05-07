import { state } from "./state.js";
import { showToast, escapeHtml } from "./utils.js";
import { parseDescriptionTags } from "./description-parser.js";

let currentAddType = null;

// ===== Mod Meta Map =====

function buildModMetaMap() {
  const map = {};
  for (const wi of state.workshopItemsData) {
    for (const sm of wi.subMods) {
      map[sm.id] = sm;
    }
  }
  return map;
}

function getModMetaMap() {
  return buildModMetaMap();
}

// ===== Tooltip =====

function formatListField(label, list) {
  if (!list || list.length === 0) return "";
  return '<span class="tt-label">' + label + ':</span> ' + escapeHtml(list.join(", "));
}

function buildSubModTooltip(subMod) {
  const lines = [];
  if (subMod.author) lines.push('<span class="tt-label">作者:</span> ' + escapeHtml(subMod.author));
  if (subMod.url) lines.push('<span class="tt-label">主页:</span> <a class="tt-link" href="' + escapeHtml(subMod.url) + '" target="_blank" rel="noopener">' + escapeHtml(subMod.url) + '</a>');
  if (subMod.modversion) lines.push('<span class="tt-label">版本:</span> ' + escapeHtml(subMod.modversion));

  const catLine = formatListField("分类", subMod.category);
  if (catLine) lines.push(catLine);

  const reqLine = formatListField("依赖", subMod.require);
  if (reqLine) lines.push(reqLine);

  const beforeLine = formatListField("需在之前加载", subMod.loadModBefore);
  if (beforeLine) lines.push(beforeLine);

  const afterLine = formatListField("需在之后加载", subMod.loadModAfter);
  if (afterLine) lines.push(afterLine);

  const incLine = formatListField("不兼容", subMod.incompatible);
  if (incLine) lines.push(incLine);

  const packLine = formatListField("Pack", subMod.pack);
  if (packLine) lines.push(packLine);

  const tiledefLine = formatListField("Tiledef", subMod.tiledef);
  if (tiledefLine) lines.push(tiledefLine);

  if (subMod.versionMin) lines.push('<span class="tt-label">最低版本:</span> ' + escapeHtml(subMod.versionMin));
  if (subMod.versionMax) lines.push('<span class="tt-label">最高版本:</span> ' + escapeHtml(subMod.versionMax));

  return lines.join("<br>");
}

// ===== Mods Rendering =====

export function renderMods() {
  renderListEditor("modsList", state.modsItems, "Mods");
}

export function renderMap() {
  renderListEditor("mapList", state.mapItems, "Map");
}

// ===== SubMod Card Rendering =====

function renderSubModCard(subMod) {
  const subModDiv = document.createElement("div");
  subModDiv.className = "submod-item";

  if (subMod.icon) {
    const iconImg = document.createElement("img");
    iconImg.className = "submod-icon";
    iconImg.src = "/api/workshop-poster?rel=" + encodeURIComponent(subMod.icon);
    iconImg.alt = "";
    iconImg.onerror = function() { this.style.display = "none"; };
    subModDiv.appendChild(iconImg);
  }

  if (subMod.poster) {
    const posterImg = document.createElement("img");
    posterImg.className = "submod-poster";
    posterImg.src = "/api/workshop-poster?rel=" + encodeURIComponent(subMod.poster);
    posterImg.alt = subMod.name;
    posterImg.onerror = function() { this.style.display = "none"; };
    subModDiv.appendChild(posterImg);
  }

  const infoDiv = document.createElement("div");
  infoDiv.className = "submod-info";

  const nameDiv = document.createElement("div");
  nameDiv.className = "submod-name";
  nameDiv.textContent = subMod.name;
  const tooltipText = buildSubModTooltip(subMod);
  if (tooltipText) {
    nameDiv.classList.add("has-tooltip");
    const tooltipDiv = document.createElement("div");
    tooltipDiv.className = "submod-tooltip";
    tooltipDiv.innerHTML = tooltipText;
    nameDiv.appendChild(tooltipDiv);
  }
  infoDiv.appendChild(nameDiv);

  if (subMod.description) {
    const descHtml = parseDescriptionTags(subMod.description, subMod.path);
    const descDiv = document.createElement("div");
    descDiv.className = "submod-description";
    descDiv.innerHTML = descHtml;
    infoDiv.appendChild(descDiv);
  }

  const idDiv = document.createElement("div");
  idDiv.className = "submod-id";
  idDiv.textContent = "ID: " + subMod.id;
  infoDiv.appendChild(idDiv);

  if (subMod.category && subMod.category.length > 0) {
    const tagsDiv = document.createElement("div");
    tagsDiv.className = "submod-categories";
    subMod.category.forEach((cat) => {
      const tag = document.createElement("span");
      tag.className = "category-tag";
      tag.textContent = cat;
      tagsDiv.appendChild(tag);
    });
    infoDiv.appendChild(tagsDiv);
  }

  if (subMod.require && subMod.require.length > 0) {
    const reqDiv = document.createElement("div");
    reqDiv.className = "submod-meta-item require";
    reqDiv.innerHTML = '<span class="meta-label">依赖:</span> ' + escapeHtml(subMod.require.join(", "));
    infoDiv.appendChild(reqDiv);
  }

  if (subMod.loadModBefore && subMod.loadModBefore.length > 0) {
    const beforeDiv = document.createElement("div");
    beforeDiv.className = "submod-meta-item load-before";
    beforeDiv.innerHTML = '<span class="meta-label">需在之前:</span> ' + escapeHtml(subMod.loadModBefore.join(", "));
    infoDiv.appendChild(beforeDiv);
  }

  if (subMod.loadModAfter && subMod.loadModAfter.length > 0) {
    const afterDiv = document.createElement("div");
    afterDiv.className = "submod-meta-item load-after";
    afterDiv.innerHTML = '<span class="meta-label">需在之后:</span> ' + escapeHtml(subMod.loadModAfter.join(", "));
    infoDiv.appendChild(afterDiv);
  }

  if (subMod.incompatible && subMod.incompatible.length > 0) {
    const incDiv = document.createElement("div");
    incDiv.className = "submod-meta-item incompatible";
    incDiv.innerHTML = '<span class="meta-label">不兼容:</span> ' + escapeHtml(subMod.incompatible.join(", "));
    infoDiv.appendChild(incDiv);
  }

  const toggleDiv = document.createElement("div");
  toggleDiv.className = "submod-toggle";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";

  const isInMods = state.modsItems.some(function(modId) {
    const cleanModId = modId.startsWith("\\") ? modId.substring(1) : modId;
    return cleanModId === subMod.id;
  });
  toggleInput.checked = isInMods;
  toggleInput.dataset.submodId = subMod.id;
  toggleInput.onchange = function() {
    const isChecked = this.checked;
    const submodId = this.dataset.submodId;

    if (isChecked) {
      ensureDependencies(submodId);

      const exists = state.modsItems.some(function(modId) {
        const cleanModId = modId.startsWith("\\") ? modId.substring(1) : modId;
        return cleanModId === submodId;
      });

      if (!exists) {
        const hasBackslash = state.modsItems.some(function(modId) { return modId.startsWith("\\"); });
        const modIdToAdd = hasBackslash ? "\\" + submodId : submodId;
        state.modsItems.push(modIdToAdd);
      }

      const conflicts = checkAllIncompatibilities(submodId);
      if (conflicts.length > 0) {
        showToast("警告: 与以下模组不兼容: " + conflicts.join(", "), "error");
      }
    } else {
      const idx = state.modsItems.findIndex(function(modId) {
        const cleanModId = modId.startsWith("\\") ? modId.substring(1) : modId;
        return cleanModId === submodId;
      });

      if (idx !== -1) {
        state.modsItems.splice(idx, 1);
      }
    }

    renderMods();
    state.isDirty = true;
  };

  const toggleSpan = document.createElement("span");
  toggleSpan.className = "toggle-slider";

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSpan);
  toggleDiv.appendChild(toggleLabel);
  infoDiv.appendChild(toggleDiv);

  subModDiv.appendChild(infoDiv);
  return subModDiv;
}

// ===== Workshop Items Rendering =====

export function renderWorkshopItems() {
  const container = document.getElementById("workshopItemsList");
  container.innerHTML = "";

  state.workshopItemsItems.forEach(function(itemId, index) {
    const workshopItem = state.workshopItemsData.find(function(wi) { return wi.id === itemId; }) || { id: itemId, isDownloaded: false, subMods: [], maps: [] };
    const div = document.createElement("div");
    div.className = "workshop-item";

    const headerDiv = document.createElement("div");
    headerDiv.className = "workshop-item-header";

    const indexSpan = document.createElement("span");
    indexSpan.className = "list-item-index";
    indexSpan.textContent = (index + 1);
    headerDiv.appendChild(indexSpan);

    const statusIndicator = document.createElement("span");
    statusIndicator.className = "workshop-status " + (workshopItem.isDownloaded ? "downloaded" : "not-downloaded");
    statusIndicator.textContent = workshopItem.isDownloaded ? "✓" : "✗";
    statusIndicator.title = workshopItem.isDownloaded ? "已下载" : "未下载";
    headerDiv.appendChild(statusIndicator);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "list-item-input";
    input.value = itemId;
    input.dataset.index = index;
    input.dataset.type = "WorkshopItems";
    headerDiv.appendChild(input);

    const buttonsDiv = document.createElement("div");
    buttonsDiv.className = "workshop-buttons";

    const upBtn = document.createElement("button");
    upBtn.className = "list-button";
    upBtn.textContent = "↑";
    upBtn.title = "上移";
    upBtn.disabled = index === 0;
    upBtn.onclick = function() { moveListItem("WorkshopItems", index, -1); };
    buttonsDiv.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.className = "list-button";
    downBtn.textContent = "↓";
    downBtn.title = "下移";
    downBtn.disabled = index === state.workshopItemsItems.length - 1;
    downBtn.onclick = function() { moveListItem("WorkshopItems", index, 1); };
    buttonsDiv.appendChild(downBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "list-button delete";
    deleteBtn.textContent = "删除";
    deleteBtn.onclick = function() { deleteListItem("WorkshopItems", index); };
    buttonsDiv.appendChild(deleteBtn);

    headerDiv.appendChild(buttonsDiv);
    div.appendChild(headerDiv);

    if (workshopItem.isDownloaded && workshopItem.subMods.length > 0) {
      const subModsDiv = document.createElement("div");
      subModsDiv.className = "submods-container";

      workshopItem.subMods.forEach(function(subMod) {
        subModsDiv.appendChild(renderSubModCard(subMod));
      });

      div.appendChild(subModsDiv);
    }

    if (workshopItem.isDownloaded && workshopItem.maps && workshopItem.maps.length > 0) {
      const mapsDiv = document.createElement("div");
      mapsDiv.className = "workshop-maps-container";

      const mapsTitle = document.createElement("div");
      mapsTitle.className = "workshop-maps-title";
      mapsTitle.textContent = "包含的地图:";
      mapsDiv.appendChild(mapsTitle);

      workshopItem.maps.forEach(function(mapName) {
        const mapItem = document.createElement("div");
        mapItem.className = "workshop-map-item";

        const mapNameSpan = document.createElement("span");
        mapNameSpan.className = "workshop-map-name";
        mapNameSpan.textContent = mapName;
        mapItem.appendChild(mapNameSpan);

        const toggleLabel = document.createElement("label");
        toggleLabel.className = "toggle";

        const toggleInput = document.createElement("input");
        toggleInput.type = "checkbox";
        toggleInput.checked = state.mapItems.indexOf(mapName) !== -1;
        toggleInput.dataset.mapName = mapName;
        toggleInput.onchange = function() {
          toggleMapItem(mapName);
        };

        const toggleSpan = document.createElement("span");
        toggleSpan.className = "toggle-slider";

        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(toggleSpan);
        mapItem.appendChild(toggleLabel);

        mapsDiv.appendChild(mapItem);
      });

      div.appendChild(mapsDiv);
    }

    container.appendChild(div);
  });
}

// ===== Generic List Editor =====

function renderListEditor(containerId, items, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const modMeta = getModMetaMap();
  const allAvailableMaps = new Set();
  for (const wi of state.workshopItemsData) {
    if (wi.maps) {
      for (const m of wi.maps) {
        allAvailableMaps.add(m);
      }
    }
  }

  items.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.draggable = true;
    div.dataset.index = index;
    div.dataset.type = type;

    let isOrphan = false;
    if (type === "Mods") {
      const cleanModId = item.startsWith("\\") ? item.substring(1) : item;
      isOrphan = !modMeta[cleanModId];
    } else if (type === "Map") {
      isOrphan = !allAvailableMaps.has(item);
    }

    if (isOrphan) {
      div.classList.add("orphan-item");
    }

    div.addEventListener("dragstart", function(e) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify({ type: type, index: index }));
      this.classList.add("dragging");
    });

    div.addEventListener("dragend", function(e) {
      this.classList.remove("dragging");
      document.querySelectorAll(".list-item").forEach(function(el) {
        el.classList.remove("drag-over");
      });
    });

    div.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      this.classList.add("drag-over");
    });

    div.addEventListener("dragleave", function(e) {
      this.classList.remove("drag-over");
    });

    div.addEventListener("drop", function(e) {
      e.preventDefault();
      this.classList.remove("drag-over");
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      const fromIndex = parseInt(data.index);
      const toIndex = parseInt(this.dataset.index);
      if (data.type === type && fromIndex !== toIndex && !isNaN(fromIndex) && !isNaN(toIndex)) {
        dragReorderItems(type, fromIndex, toIndex);
      }
    });

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "拖动排序";
    div.appendChild(dragHandle);

    const indexSpan = document.createElement("span");
    indexSpan.className = "list-item-index";
    indexSpan.textContent = (index + 1);
    div.appendChild(indexSpan);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "list-item-input";
    input.value = item;
    input.dataset.index = index;
    input.dataset.type = type;
    div.appendChild(input);

    const upBtn = document.createElement("button");
    upBtn.className = "list-button";
    upBtn.textContent = "↑";
    upBtn.title = "上移";
    upBtn.disabled = index === 0;
    upBtn.onclick = () => moveListItem(type, index, -1);
    div.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.className = "list-button";
    downBtn.textContent = "↓";
    downBtn.title = "下移";
    downBtn.disabled = index === items.length - 1;
    downBtn.onclick = () => moveListItem(type, index, 1);
    div.appendChild(downBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "list-button delete";
    deleteBtn.textContent = "删除";
    deleteBtn.onclick = () => deleteListItem(type, index);
    div.appendChild(deleteBtn);

    container.appendChild(div);
  });
}

// ===== Available Maps =====



function toggleMapItem(mapName) {
  const idx = state.mapItems.indexOf(mapName);
  if (idx !== -1) {
    state.mapItems.splice(idx, 1);
  } else {
    state.mapItems.push(mapName);
  }
  state.isDirty = true;
  renderMap();
}

// ===== List Operations =====

function getItemsArray(type) {
  if (type === "Mods") return state.modsItems;
  if (type === "WorkshopItems") return state.workshopItemsItems;
  if (type === "Map") return state.mapItems;
  return null;
}

function rerenderByType(type) {
  if (type === "Mods") renderMods();
  else if (type === "WorkshopItems") renderWorkshopItems();
  else if (type === "Map") renderMap();
}

function moveListItem(type, index, direction) {
  const arr = getItemsArray(type);
  if (!arr) return;
  const temp = arr[index];
  arr[index] = arr[index + direction];
  arr[index + direction] = temp;
  state.isDirty = true;
  rerenderByType(type);
}

function deleteListItem(type, index) {
  const arr = getItemsArray(type);
  if (!arr) return;

  if (type === "WorkshopItems") {
    const itemId = arr[index];
    const workshopItem = state.workshopItemsData.find((wi) => wi.id === itemId);
    if (workshopItem) {
      for (const subMod of workshopItem.subMods) {
        const mi = state.modsItems.findIndex((m) => {
          const clean = m.startsWith("\\") ? m.substring(1) : m;
          return clean === subMod.id;
        });
        if (mi !== -1) state.modsItems.splice(mi, 1);
      }
      for (const mapName of workshopItem.maps) {
        const mi = state.mapItems.indexOf(mapName);
        if (mi !== -1) state.mapItems.splice(mi, 1);
      }
    }
  }

  arr.splice(index, 1);
  markDirty();
  rerenderByType(type);
  if (type === "WorkshopItems") {
    renderMods();
    renderMap();
  }
}

function dragReorderItems(type, fromIndex, toIndex) {
  const arr = getItemsArray(type);
  if (!arr) return;
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  state.isDirty = true;
  rerenderByType(type);
}

// ===== Add Item Dialog =====

export function addListItem(type) {
  currentAddType = type;

  const dialogTitle = document.getElementById("dialogTitle");
  const dialogLabel = document.getElementById("dialogLabel");
  const dialogInput = document.getElementById("dialogInput");

  if (type === "Mods") {
    dialogTitle.textContent = "添加模组 (Mods)";
    dialogLabel.textContent = "模组ID";
    dialogInput.placeholder = "请输入模组ID";
  } else if (type === "WorkshopItems") {
    dialogTitle.textContent = "添加创意工坊项目 (WorkshopItems)";
    dialogLabel.textContent = "创意工坊ID";
    dialogInput.placeholder = "请输入创意工坊ID";
  } else if (type === "Map") {
    dialogTitle.textContent = "添加地图 (Map)";
    dialogLabel.textContent = "地图名称";
    dialogInput.placeholder = "请输入地图名称";
  }

  dialogInput.value = "";

  const dialog = document.getElementById("addItemDialog");
  dialog.classList.add("active");

  setTimeout(() => {
    dialogInput.focus();
  }, 100);
}

export function hideDialog() {
  const dialog = document.getElementById("addItemDialog");
  dialog.classList.remove("active");
  currentAddType = null;
}

export function confirmAddItem() {
  const inputValue = document.getElementById("dialogInput").value.trim();

  if (!inputValue) return;

  if (currentAddType === "Mods") {
    state.modsItems.push(inputValue);
    renderMods();
  } else if (currentAddType === "WorkshopItems") {
    state.workshopItemsItems.push(inputValue);
    renderWorkshopItems();
  } else if (currentAddType === "Map") {
    state.mapItems.push(inputValue);
    renderMap();
  }

  state.isDirty = true;
  hideDialog();
}

// ===== Dependency & Incompatibility =====

function ensureDependencies(submodId, visited) {
  if (!visited) visited = new Set();
  if (visited.has(submodId)) return;
  visited.add(submodId);

  const modMeta = getModMetaMap();
  const meta = modMeta[submodId];
  if (!meta || !meta.require) return;

  for (const depId of meta.require) {
    const cleanDep = depId.startsWith("\\") ? depId.substring(1) : depId;
    const isEnabled = state.modsItems.some(function(m) {
      return (m.startsWith("\\") ? m.substring(1) : m) === cleanDep;
    });
    if (!isEnabled) {
      const hasBackslash = state.modsItems.some(function(m) { return m.startsWith("\\"); }) || depId.startsWith("\\");
      const addId = hasBackslash ? "\\" + cleanDep : cleanDep;
      state.modsItems.push(addId);
    }
    ensureDependencies(cleanDep, visited);
  }
}

function checkModIncompatibilities(submodId) {
  const conflicts = [];
  const modMeta = getModMetaMap();
  const meta = modMeta[submodId];
  if (meta && meta.incompatible) {
    for (let i = 0; i < meta.incompatible.length; i++) {
      const incId = meta.incompatible[i];
      const cleanInc = incId.startsWith("\\") ? incId.substring(1) : incId;
      const isEnabled = state.modsItems.some(function(m) {
        return (m.startsWith("\\") ? m.substring(1) : m) === cleanInc;
      });
      if (isEnabled) conflicts.push(cleanInc);
    }
  }
  return conflicts;
}

function checkReverseIncompatibilities(submodId) {
  const conflicts = [];
  const modMeta = getModMetaMap();
  const keys = Object.keys(modMeta);
  for (let i = 0; i < keys.length; i++) {
    const modId = keys[i];
    const meta = modMeta[modId];
    if (!meta.incompatible) continue;
    const isEnabled = state.modsItems.some(function(m) {
      return (m.startsWith("\\") ? m.substring(1) : m) === modId;
    });
    if (!isEnabled) continue;
    for (let j = 0; j < meta.incompatible.length; j++) {
      const incId = meta.incompatible[j];
      const cleanInc = incId.startsWith("\\") ? incId.substring(1) : incId;
      if (cleanInc === submodId) {
        conflicts.push(modId);
        break;
      }
    }
  }
  return conflicts;
}

function checkAllIncompatibilities(submodId) {
  const direct = checkModIncompatibilities(submodId);
  const reverse = checkReverseIncompatibilities(submodId);
  const all = direct.slice();
  for (let i = 0; i < reverse.length; i++) {
    if (all.indexOf(reverse[i]) === -1) all.push(reverse[i]);
  }
  return all;
}

// ===== Auto Sort =====

export function autoSortMods() {
  const modMeta = getModMetaMap();
  const modSet = {};
  const allModIds = [];

  for (let i = 0; i < state.modsItems.length; i++) {
    const clean = state.modsItems[i].startsWith("\\") ? state.modsItems[i].substring(1) : state.modsItems[i];
    if (!modSet[clean]) {
      modSet[clean] = true;
      allModIds.push(clean);
    }
  }

  const inDegree = {};
  const adj = {};

  for (let i = 0; i < allModIds.length; i++) {
    const modId = allModIds[i];
    inDegree[modId] = 0;
    adj[modId] = [];
  }

  for (let i = 0; i < allModIds.length; i++) {
    const modId = allModIds[i];
    const meta = modMeta[modId];
    if (!meta) continue;

    if (meta.require) {
      for (let j = 0; j < meta.require.length; j++) {
        const depId = meta.require[j];
        const cleanDep = depId.startsWith("\\") ? depId.substring(1) : depId;
        if (modSet[cleanDep]) {
          adj[cleanDep] = adj[cleanDep] || [];
          adj[cleanDep].push(modId);
          inDegree[modId] = (inDegree[modId] || 0) + 1;
        }
      }
    }

    if (meta.loadModBefore) {
      for (let j = 0; j < meta.loadModBefore.length; j++) {
        const targetId = meta.loadModBefore[j];
        const cleanTarget = targetId.startsWith("\\") ? targetId.substring(1) : targetId;
        if (modSet[cleanTarget]) {
          adj[modId] = adj[modId] || [];
          adj[modId].push(cleanTarget);
          inDegree[cleanTarget] = (inDegree[cleanTarget] || 0) + 1;
        }
      }
    }

    if (meta.loadModAfter) {
      for (let j = 0; j < meta.loadModAfter.length; j++) {
        const targetId = meta.loadModAfter[j];
        const cleanTarget = targetId.startsWith("\\") ? targetId.substring(1) : targetId;
        if (modSet[cleanTarget]) {
          adj[cleanTarget] = adj[cleanTarget] || [];
          adj[cleanTarget].push(modId);
          inDegree[modId] = (inDegree[modId] || 0) + 1;
        }
      }
    }
  }

  let queue = [];
  for (let i = 0; i < allModIds.length; i++) {
    const modId = allModIds[i];
    if ((inDegree[modId] || 0) === 0) {
      queue.push(modId);
    }
  }
  queue.sort();

  const sorted = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);
    const neighbors = adj[current] || [];
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
    queue.sort();
  }

  if (sorted.length !== allModIds.length) {
    const missing = [];
    for (let i = 0; i < allModIds.length; i++) {
      if (sorted.indexOf(allModIds[i]) === -1) missing.push(allModIds[i]);
    }
    showToast("检测到循环依赖，以下模组无法排序: " + missing.join(", "), "error");
    for (let i = 0; i < missing.length; i++) {
      sorted.push(missing[i]);
    }
  }

  const originalMap = {};
  for (let i = 0; i < state.modsItems.length; i++) {
    const modId = state.modsItems[i];
    const clean = modId.startsWith("\\") ? modId.substring(1) : modId;
    if (!originalMap[clean]) originalMap[clean] = modId;
  }

  const newMods = [];
  for (let i = 0; i < sorted.length; i++) {
    newMods.push(originalMap[sorted[i]] || sorted[i]);
  }

  state.modsItems = newMods;
  renderMods();

  const modsList = document.getElementById("modsList");
  if (modsList) {
    modsList.classList.add("sorting");
    setTimeout(function() { modsList.classList.remove("sorting"); }, 1500);
  }

  const allConflicts = [];
  for (let i = 0; i < allModIds.length; i++) {
    const c = checkModIncompatibilities(allModIds[i]);
    for (let j = 0; j < c.length; j++) {
      const pair = [allModIds[i], c[j]].sort().join(" ↔ ");
      if (allConflicts.indexOf(pair) === -1) allConflicts.push(pair);
    }
  }
  if (allConflicts.length > 0) {
    showToast("警告: 检测到不兼容的模组同时启用: " + allConflicts.join("; "), "error");
  } else {
    showToast("模组已自动排序", "success");
  }
}
