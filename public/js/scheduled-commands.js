import { state } from "./state.js";
import { showToast } from "./utils.js";
import { updateServer } from "./api.js";
import { confirmAction } from "./confirm-dialog.js";

const ACTION_OPTIONS = [
  { value: "start", label: "启动" },
  { value: "stop", label: "停止" },
  { value: "force-stop", label: "强制停止" },
  { value: "restart", label: "重启" },
  { value: "backup", label: "创建备份" },
];

const WEEKDAYS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" },
];

const ALL_WEEKDAYS = WEEKDAYS.map((weekday) => weekday.value);

let editingCommandId = null;

function getActionLabel(action) {
  return ACTION_OPTIONS.find((option) => option.value === action)?.label || action;
}

function getCommands() {
  return Array.isArray(state.currentServer?.scheduledCommands)
    ? state.currentServer.scheduledCommands
    : [];
}

function createId() {
  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function parseCronForForm(cron) {
  const parts = typeof cron === "string" ? cron.trim().split(/\s+/) : [];
  if (parts.length !== 5) {
    return null;
  }

  const [minuteText, hourText, dayOfMonth, month, dayOfWeek] = parts;
  if (
    !/^\d+$/.test(minuteText) ||
    !/^\d+$/.test(hourText) ||
    dayOfMonth !== "*" ||
    month !== "*"
  ) {
    return null;
  }

  const minute = Number(minuteText);
  const hour = Number(hourText);
  if (minute > 59 || hour > 23) {
    return null;
  }

  let weekdays;
  if (dayOfWeek === "*") {
    weekdays = [...ALL_WEEKDAYS];
  } else {
    const values = dayOfWeek.split(",");
    if (!values.every((value) => /^\d+$/.test(value))) {
      return null;
    }

    weekdays = [...new Set(
      values
        .map(Number)
        .map((value) => (value === 7 ? 0 : value))
        .filter((value) => value >= 0 && value <= 6),
    )];

    if (weekdays.length === 0) {
      return null;
    }
  }

  return { hour, minute, weekdays };
}

function describeSchedule(cron) {
  const schedule = parseCronForForm(cron);
  if (!schedule) {
    return { text: "自定义时间", custom: true };
  }

  const time = `${padNumber(schedule.hour)}:${padNumber(schedule.minute)}`;
  if (schedule.weekdays.length === ALL_WEEKDAYS.length) {
    return { text: `每天 ${time}`, custom: false };
  }

  const labels = WEEKDAYS
    .filter((weekday) => schedule.weekdays.includes(weekday.value))
    .map((weekday) => weekday.label);

  return { text: `${labels.join("、")} ${time}`, custom: false };
}

function buildCron(hour, minute, weekdays) {
  const sorted = [...weekdays].sort((a, b) => a - b);
  const dayOfWeek = sorted.length === ALL_WEEKDAYS.length ? "*" : sorted.join(",");
  return `${minute} ${hour} * * ${dayOfWeek}`;
}

function createRow(command) {
  const row = document.createElement("div");
  row.className = "scheduled-command-row";
  row.dataset.id = command.id;

  const info = document.createElement("div");
  info.className = "scheduled-command-info";

  const nameEl = document.createElement("span");
  nameEl.className = "scheduled-command-name";
  nameEl.textContent = command.name || getActionLabel(command.action);

  const schedule = describeSchedule(command.cron);
  const metaEl = document.createElement("span");
  metaEl.className = "scheduled-command-meta";
  const updateMeta = (enabled) => {
    const metaParts = [getActionLabel(command.action), schedule.text];
    if (!enabled) {
      metaParts.push("已停用");
    }
    metaEl.textContent = metaParts.join(" · ");
  };
  updateMeta(command.enabled !== false);

  info.append(nameEl, metaEl);

  const actions = document.createElement("div");
  actions.className = "scheduled-command-actions";

  const toggleWrapper = document.createElement("div");
  toggleWrapper.className = "submod-toggle";

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "toggle";
  toggleLabel.title = "启用或停用该定时命令";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.className = "scheduled-command-toggle";
  toggleInput.checked = command.enabled !== false;

  const toggleSlider = document.createElement("span");
  toggleSlider.className = "toggle-slider";

  toggleLabel.append(toggleInput, toggleSlider);

  toggleInput.addEventListener("change", async () => {
    const nextCommands = getCommands().map((item) =>
      item.id === command.id ? { ...item, enabled: toggleInput.checked } : item,
    );
    const saved = await persistCommands(
      nextCommands,
      toggleInput.checked ? "定时命令已启用" : "定时命令已停用",
      { render: false },
    );
    if (!saved) {
      renderScheduledCommands();
    } else {
      updateMeta(toggleInput.checked);
    }
  });

  toggleWrapper.appendChild(toggleLabel);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "scheduled-command-button scheduled-command-edit";
  editButton.textContent = "编辑";
  editButton.addEventListener("click", () => openScheduledCommandDialog(command));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "scheduled-command-button scheduled-command-delete";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", () => deleteScheduledCommand(command.id));

  actions.append(toggleWrapper, editButton, deleteButton);

  row.append(info, actions);
  return row;
}

function getListContainer() {
  return document.getElementById("scheduledCommandsList");
}

function updateEmptyState() {
  const container = getListContainer();
  if (!container) return;

  const hasRows = container.querySelector(".scheduled-command-row");
  const emptyEl = container.querySelector(".scheduled-command-empty");

  if (!hasRows && !emptyEl) {
    const empty = document.createElement("p");
    empty.className = "scheduled-command-empty";
    empty.textContent = "暂无定时命令";
    container.appendChild(empty);
  } else if (hasRows && emptyEl) {
    emptyEl.remove();
  }
}

export function renderScheduledCommands() {
  const container = getListContainer();
  if (!container) return;

  container.innerHTML = "";

  for (const command of getCommands()) {
    container.appendChild(createRow(command));
  }

  updateEmptyState();
}

function getDialog() {
  return document.getElementById("scheduledCommandDialog");
}

let timePickerDocumentListenerBound = false;

function closeTimePickers() {
  document.querySelectorAll(".time-picker-menu.open").forEach((menu) => {
    menu.classList.remove("open");
  });
}

function syncTimePicker(selectId) {
  const select = document.getElementById(selectId);
  const trigger = document.getElementById(`${selectId}Trigger`);
  const menu = document.getElementById(`${selectId}Menu`);
  if (!select || !trigger) return;

  trigger.textContent = padNumber(Number(select.value) || 0);

  if (menu) {
    for (const option of menu.querySelectorAll(".time-picker-option")) {
      option.classList.toggle("selected", option.dataset.value === select.value);
    }
  }
}

function populateTimePicker(selectId, count) {
  const select = document.getElementById(selectId);
  const trigger = document.getElementById(`${selectId}Trigger`);
  const menu = document.getElementById(`${selectId}Menu`);
  if (!select || !trigger || !menu) return;

  if (select.options.length === 0) {
    for (let value = 0; value < count; value += 1) {
      const text = padNumber(value);

      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = text;
      select.appendChild(option);

      const menuOption = document.createElement("button");
      menuOption.type = "button";
      menuOption.className = "time-picker-option";
      menuOption.dataset.value = String(value);
      menuOption.textContent = text;
      menuOption.addEventListener("click", () => {
        select.value = String(value);
        syncTimePicker(selectId);
        closeTimePickers();
      });
      menu.appendChild(menuOption);
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.contains("open");
      closeTimePickers();
      if (!isOpen) {
        menu.classList.add("open");
      }
    });
  }

  syncTimePicker(selectId);

  if (!timePickerDocumentListenerBound) {
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".time-picker")) {
        closeTimePickers();
      }
    });
    timePickerDocumentListenerBound = true;
  }
}

function populateTimeSelects() {
  populateTimePicker("scheduledCommandHour", 24);
  populateTimePicker("scheduledCommandMinute", 60);
}

function createWeekdayCheckbox(value, labelText) {
  const label = document.createElement("label");
  label.className = "weekday-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = String(value);
  input.dataset.weekday = value === "every" ? "every" : "day";
  input.addEventListener("change", () => syncWeekdaySelection(input));

  const text = document.createElement("span");
  text.textContent = labelText;

  label.append(input, text);
  return label;
}

function syncWeekdaySelection(source) {
  const container = document.getElementById("scheduledCommandWeekdays");
  if (!container) return;

  const everyInput = container.querySelector('input[data-weekday="every"]');
  const dayInputs = [...container.querySelectorAll('input[data-weekday="day"]')];
  if (!everyInput) return;

  if (source === everyInput) {
    for (const input of dayInputs) {
      input.checked = everyInput.checked;
    }
    return;
  }

  everyInput.checked = dayInputs.every((input) => input.checked);
}

function populateWeekdayOptions() {
  const container = document.getElementById("scheduledCommandWeekdays");
  if (!container || container.children.length > 0) {
    return;
  }

  container.appendChild(createWeekdayCheckbox("every", "每天"));

  for (const weekday of WEEKDAYS) {
    container.appendChild(createWeekdayCheckbox(weekday.value, weekday.label));
  }
}

function openScheduledCommandDialog(command) {
  populateTimeSelects();
  populateWeekdayOptions();

  editingCommandId = command?.id || null;

  const dialog = getDialog();
  const title = document.getElementById("scheduledCommandDialogTitle");
  const nameInput = document.getElementById("scheduledCommandName");
  const actionSelect = document.getElementById("scheduledCommandAction");
  const hourSelect = document.getElementById("scheduledCommandHour");
  const minuteSelect = document.getElementById("scheduledCommandMinute");
  const enabledInput = document.getElementById("scheduledCommandEnabled");

  const schedule = command ? parseCronForForm(command.cron) : null;

  if (title) {
    title.textContent = command ? "编辑定时命令" : "添加定时命令";
  }
  if (nameInput) {
    nameInput.value = command?.name || "";
  }
  if (actionSelect) {
    actionSelect.value = ACTION_OPTIONS.some((option) => option.value === command?.action)
      ? command.action
      : "start";
  }
  if (hourSelect) {
    hourSelect.value = String(schedule?.hour ?? 0);
    syncTimePicker("scheduledCommandHour");
  }
  if (minuteSelect) {
    minuteSelect.value = String(schedule?.minute ?? 0);
    syncTimePicker("scheduledCommandMinute");
  }

  const weekdays = schedule?.weekdays ?? ALL_WEEKDAYS;
  const everyInput = document.querySelector(
    '#scheduledCommandWeekdays input[data-weekday="every"]',
  );
  if (everyInput) {
    everyInput.checked = weekdays.length === ALL_WEEKDAYS.length;
  }
  const checkboxes = document.querySelectorAll(
    '#scheduledCommandWeekdays input[data-weekday="day"]',
  );
  for (const checkbox of checkboxes) {
    checkbox.checked = weekdays.includes(Number(checkbox.value));
  }

  if (enabledInput) {
    enabledInput.checked = command?.enabled !== false;
  }

  dialog?.classList.add("active");
  nameInput?.focus();
}

export function addScheduledCommand() {
  openScheduledCommandDialog(null);
}

export function closeScheduledCommandDialog() {
  getDialog()?.classList.remove("active");
  editingCommandId = null;
}

async function persistCommands(commands, successMessage, options = {}) {
  if (!state.currentServerId) {
    return false;
  }

  const confirmButton = document.getElementById("confirmScheduledCommandDialog");
  if (confirmButton) {
    confirmButton.disabled = true;
  }

  try {
    const updated = await updateServer(state.currentServerId, {
      scheduledCommands: commands,
    });

    state.currentServer = {
      ...state.currentServer,
      ...updated,
      scheduledCommands: Array.isArray(updated.scheduledCommands)
        ? updated.scheduledCommands
        : commands,
    };

    if (options.render !== false) {
      renderScheduledCommands();
    }
    closeScheduledCommandDialog();
    showToast(successMessage, "success");
    return true;
  } catch (error) {
    showToast("保存定时命令失败: " + error.message, "error");
    return false;
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
    }
  }
}

export async function confirmScheduledCommand() {
  const nameInput = document.getElementById("scheduledCommandName");
  const actionSelect = document.getElementById("scheduledCommandAction");
  const hourSelect = document.getElementById("scheduledCommandHour");
  const minuteSelect = document.getElementById("scheduledCommandMinute");
  const enabledInput = document.getElementById("scheduledCommandEnabled");

  const name = nameInput?.value.trim() || "";
  if (!name) {
    showToast("请填写名称", "error");
    return;
  }

  const action = actionSelect?.value || "start";
  if (!ACTION_OPTIONS.some((option) => option.value === action)) {
    showToast("请选择有效的操作", "error");
    return;
  }

  const hour = Number(hourSelect?.value);
  const minute = Number(minuteSelect?.value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    showToast("请选择有效的时间", "error");
    return;
  }

  const weekdays = [...document.querySelectorAll(
    '#scheduledCommandWeekdays input[data-weekday="day"]:checked',
  )].map((input) => Number(input.value));
  if (weekdays.length === 0) {
    showToast("请至少选择一个重复日期", "error");
    return;
  }

  const command = {
    id: editingCommandId || createId(),
    name,
    action,
    cron: buildCron(hour, minute, weekdays),
    enabled: enabledInput ? enabledInput.checked : true,
  };

  const commands = getCommands();
  const nextCommands = editingCommandId
    ? commands.map((item) => (item.id === editingCommandId ? command : item))
    : [...commands, command];

  const isEditing = Boolean(editingCommandId);
  await persistCommands(
    nextCommands,
    isEditing ? "定时命令已更新" : "定时命令已添加",
  );
}

export async function deleteScheduledCommand(commandId) {
  const command = getCommands().find((item) => item.id === commandId);
  if (!command) {
    return;
  }

  const confirmed = await confirmAction({
    title: "删除定时命令",
    message: `确定要删除定时命令“${command.name || getActionLabel(command.action)}”吗？`,
    confirmText: "删除",
    danger: true,
  });
  if (!confirmed) {
    return;
  }

  await persistCommands(
    getCommands().filter((item) => item.id !== commandId),
    "定时命令已删除",
  );
}
