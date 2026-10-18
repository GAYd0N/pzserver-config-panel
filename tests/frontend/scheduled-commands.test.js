// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state } from "../../public/js/state.js";
import {
  addScheduledCommand,
  confirmScheduledCommand,
  renderScheduledCommands,
} from "../../public/js/scheduled-commands.js";

describe("scheduled-commands.js", () => {
  let fetchMock;

  beforeEach(() => {
    state.currentServerId = "main";
    state.currentServer = { id: "main", name: "Main", scheduledCommands: [] };

    document.body.innerHTML = `
      <div id="scheduledCommandsList"></div>
      <div id="toastContainer"></div>
      <div id="scheduledCommandDialog" class="dialog-overlay">
        <h3 id="scheduledCommandDialogTitle"></h3>
        <input id="scheduledCommandName" />
        <select id="scheduledCommandAction">
          <option value="start">启动</option>
          <option value="stop">停止</option>
          <option value="force-stop">强制停止</option>
          <option value="restart">重启</option>
        </select>
        <div class="time-picker">
          <button id="scheduledCommandHourTrigger" type="button">00</button>
          <select id="scheduledCommandHour"></select>
          <div id="scheduledCommandHourMenu" class="time-picker-menu"></div>
        </div>
        <div class="time-picker">
          <button id="scheduledCommandMinuteTrigger" type="button">00</button>
          <select id="scheduledCommandMinute"></select>
          <div id="scheduledCommandMinuteMenu" class="time-picker-menu"></div>
        </div>
        <div id="scheduledCommandWeekdays"></div>
        <input id="scheduledCommandEnabled" type="checkbox" checked />
        <button id="confirmScheduledCommandDialog"></button>
      </div>
    `;

    fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "main",
          name: "Main",
          scheduledCommands: body.scheduledCommands,
        }),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an empty state when no commands are configured", () => {
    renderScheduledCommands();

    expect(document.querySelector(".scheduled-command-empty")).not.toBeNull();
  });

  it("renders name, action, and time instead of editable cron inputs", () => {
    state.currentServer.scheduledCommands = [
      {
        id: "nightly",
        name: "每日重启",
        action: "restart",
        cron: "0 4 * * *",
        enabled: true,
      },
    ];

    renderScheduledCommands();

    expect(document.querySelector(".scheduled-command-name").textContent).toBe("每日重启");
    expect(document.querySelector(".scheduled-command-meta").textContent).toContain("重启");
    expect(document.querySelector(".scheduled-command-meta").textContent).toContain("每天 04:00");
    expect(document.querySelector(".scheduled-command-cron")).toBeNull();
    expect(document.querySelector(".scheduled-command-edit").textContent).toBe("编辑");
    expect(document.querySelector(".scheduled-command-toggle").checked).toBe(true);
  });

  it("toggles a command on or off through its switch and saves automatically", async () => {
    state.currentServer.scheduledCommands = [
      {
        id: "nightly",
        name: "每日重启",
        action: "restart",
        cron: "0 4 * * *",
        enabled: true,
      },
    ];
    renderScheduledCommands();

    const toggle = document.querySelector(".scheduled-command-toggle");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.scheduledCommands[0].enabled).toBe(false);
    expect(state.currentServer.scheduledCommands[0].enabled).toBe(false);
    expect(document.querySelector(".scheduled-command-meta").textContent).toContain("已停用");
  });

  it("opens the dialog with time selects, weekday options, and defaults for a new command", () => {
    addScheduledCommand();

    expect(document.getElementById("scheduledCommandDialog").classList.contains("active")).toBe(true);
    expect(document.getElementById("scheduledCommandDialogTitle").textContent).toBe("添加定时命令");
    expect(document.getElementById("scheduledCommandHour").options).toHaveLength(24);
    expect(document.getElementById("scheduledCommandMinute").options).toHaveLength(60);
    expect(document.querySelectorAll('#scheduledCommandWeekdays input[data-weekday="every"]:checked')).toHaveLength(1);
    expect(document.querySelectorAll('#scheduledCommandWeekdays input[data-weekday="day"]:checked')).toHaveLength(7);
    expect(document.getElementById("scheduledCommandEnabled").checked).toBe(true);
  });

  it("syncs the everyday option with the weekday selection", () => {
    addScheduledCommand();

    const everyInput = document.querySelector('#scheduledCommandWeekdays input[data-weekday="every"]');
    const dayInputs = [...document.querySelectorAll('#scheduledCommandWeekdays input[data-weekday="day"]')];
    expect(everyInput.parentElement.textContent.trim()).toBe("每天");

    everyInput.checked = false;
    everyInput.dispatchEvent(new Event("change"));
    expect(dayInputs.every((input) => !input.checked)).toBe(true);

    dayInputs[0].checked = true;
    dayInputs[0].dispatchEvent(new Event("change"));
    expect(everyInput.checked).toBe(false);

    for (const input of dayInputs) {
      input.checked = true;
      input.dispatchEvent(new Event("change"));
    }
    expect(everyInput.checked).toBe(true);
  });

  it("selects a time from the custom picker menu", () => {
    addScheduledCommand();

    const trigger = document.getElementById("scheduledCommandHourTrigger");
    const menu = document.getElementById("scheduledCommandHourMenu");

    trigger.click();

    expect(menu.classList.contains("open")).toBe(true);
    expect(menu.querySelectorAll(".time-picker-option")).toHaveLength(24);

    menu.querySelector('[data-value="7"]').click();

    expect(document.getElementById("scheduledCommandHour").value).toBe("7");
    expect(trigger.textContent).toBe("07");
    expect(menu.classList.contains("open")).toBe(false);
  });

  it("saves everyday commands with a wildcard day field", async () => {
    addScheduledCommand();
    document.getElementById("scheduledCommandName").value = "每天清理";
    document.getElementById("scheduledCommandHour").value = "3";
    document.getElementById("scheduledCommandMinute").value = "15";

    await confirmScheduledCommand();

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.scheduledCommands[0].cron).toBe("15 3 * * *");
  });

  it("saves a new command automatically after confirming the dialog", async () => {
    addScheduledCommand();

    document.getElementById("scheduledCommandName").value = "每周清理";
    document.getElementById("scheduledCommandAction").value = "stop";
    document.getElementById("scheduledCommandHour").value = "4";
    document.getElementById("scheduledCommandMinute").value = "30";
    for (const checkbox of document.querySelectorAll('#scheduledCommandWeekdays input[data-weekday="day"]')) {
      checkbox.checked = ["周一", "周三"].includes(checkbox.parentElement.textContent.trim());
    }
    document.querySelector('#scheduledCommandWeekdays input[data-weekday="every"]').checked = false;
    document.getElementById("scheduledCommandEnabled").checked = false;

    await confirmScheduledCommand();

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.scheduledCommands).toHaveLength(1);
    expect(requestBody.scheduledCommands[0]).toMatchObject({
      name: "每周清理",
      action: "stop",
      cron: "30 4 * * 1,3",
      enabled: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/servers/main", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduledCommands: requestBody.scheduledCommands }),
    });
    expect(state.currentServer.scheduledCommands).toHaveLength(1);
    expect(document.getElementById("scheduledCommandDialog").classList.contains("active")).toBe(false);
    expect(document.querySelector(".scheduled-command-name").textContent).toBe("每周清理");
    expect(document.querySelector(".scheduled-command-meta").textContent).toContain("周一、周三 04:30");
  });

  it("opens the edit dialog with the existing command values and saves updates", async () => {
    state.currentServer.scheduledCommands = [
      {
        id: "nightly",
        name: "每日重启",
        action: "restart",
        cron: "0 4 * * *",
        enabled: true,
      },
    ];
    renderScheduledCommands();

    document.querySelector(".scheduled-command-edit").click();

    expect(document.getElementById("scheduledCommandDialogTitle").textContent).toBe("编辑定时命令");
    expect(document.getElementById("scheduledCommandName").value).toBe("每日重启");
    expect(document.getElementById("scheduledCommandAction").value).toBe("restart");
    expect(document.getElementById("scheduledCommandHour").value).toBe("4");
    expect(document.getElementById("scheduledCommandMinute").value).toBe("0");

    document.getElementById("scheduledCommandName").value = "凌晨重启";

    await confirmScheduledCommand();

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.scheduledCommands).toEqual([
      {
        id: "nightly",
        name: "凌晨重启",
        action: "restart",
        cron: "0 4 * * *",
        enabled: true,
      },
    ]);
  });

  it("rejects commands without a description or weekday", async () => {
    addScheduledCommand();
    await confirmScheduledCommand();
    expect(fetchMock).not.toHaveBeenCalled();

    document.getElementById("scheduledCommandName").value = "清理";
    for (const checkbox of document.querySelectorAll("#scheduledCommandWeekdays input")) {
      checkbox.checked = false;
    }
    await confirmScheduledCommand();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a command after confirmation and saves automatically", async () => {
    state.currentServer.scheduledCommands = [
      {
        id: "nightly",
        name: "每日重启",
        action: "restart",
        cron: "0 4 * * *",
        enabled: true,
      },
    ];
    renderScheduledCommands();

    document.querySelector(".scheduled-command-delete").click();
    await Promise.resolve();

    document.querySelector("#appConfirmDialog [data-confirm-accept]").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.scheduledCommands).toEqual([]);
    expect(state.currentServer.scheduledCommands).toEqual([]);
  });
});
