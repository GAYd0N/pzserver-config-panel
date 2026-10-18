// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state } from "../../public/js/state.js";
import { renderConfig, gatherConfigItems } from "../../public/js/config.js";
import { renderMods, addListItem, confirmAddItem } from "../../public/js/mods.js";

describe("config.js", () => {
  beforeEach(() => {
    state.configData = null;
    state.normalItems = [];
    state.modsItems = [];
    state.workshopItemsItems = [];
    state.workshopItemsData = [];
    state.mapItems = [];
    state.groupedNormalItems = {};
    state.currentServerId = "server-1";
    state.isDirty = false;
    state.configRevision = 0;

    document.body.innerHTML = `
      <div id="normalItemsList"></div>
      <div id="modsList"></div>
      <div id="workshopItemsList"></div>
      <div id="mapList"></div>
      <div id="availableMapsSection" style="display:none"></div>
      <div id="availableMapsList"></div>
      <div id="toastContainer"></div>
      <div id="addItemDialog" class="dialog-overlay">
        <h3 id="dialogTitle"></h3>
        <label id="dialogLabel"></label>
        <input id="dialogInput" />
      </div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renderConfig parses Mods, WorkshopItems, Map from config items", () => {
    state.configData = {
      items: [
        { key: "Mods", value: "modA;modB;modC", isKnown: true },
        { key: "WorkshopItems", value: "123;456", isKnown: true },
        { key: "Map", value: "Muldraugh;Riverside", isKnown: true },
        { key: "PublicName", value: "My Server", isKnown: true },
        { key: "MaxPlayers", value: "32", isKnown: true },
      ],
      workshopItems: [],
    };

    renderConfig();

    expect(state.modsItems).toEqual(["modA", "modB", "modC"]);
    expect(state.workshopItemsItems).toEqual(["123", "456"]);
    expect(state.mapItems).toEqual(["Muldraugh", "Riverside"]);
    expect(state.normalItems).toHaveLength(2);
    expect(state.normalItems[0].key).toBe("PublicName");
    expect(state.normalItems[1].key).toBe("MaxPlayers");
  });

  it("renderConfig groups normal items into categories", () => {
    state.configData = {
      items: [
        { key: "PublicName", value: "Test", isKnown: true },
        { key: "DefaultPort", value: "16261", isKnown: true },
        { key: "PVP", value: "true", isKnown: true },
        { key: "GlobalChat", value: "true", isKnown: true },
        { key: "PauseEmpty", value: "true", isKnown: true },
        { key: "CustomUnknownKey", value: "blah", isKnown: false },
      ],
      workshopItems: [],
    };

    renderConfig();

    expect(state.groupedNormalItems.basic).toHaveLength(2);
    expect(state.groupedNormalItems.basic.map((i) => i.key)).toEqual(["PublicName", "DefaultPort"]);
    expect(state.groupedNormalItems.pvp).toHaveLength(1);
    expect(state.groupedNormalItems.pvp[0].key).toBe("PVP");
    expect(state.groupedNormalItems.chat).toHaveLength(1);
    expect(state.groupedNormalItems.chat[0].key).toBe("GlobalChat");
    expect(state.groupedNormalItems.performance).toHaveLength(1);
    expect(state.groupedNormalItems.performance[0].key).toBe("PauseEmpty");
    expect(state.groupedNormalItems.other).toHaveLength(1);
    expect(state.groupedNormalItems.other[0].key).toBe("CustomUnknownKey");
  });

  it("gatherConfigItems collects normal input values", () => {
    document.body.innerHTML = `
      <div id="normalItemsList">
        <input class="item-input" data-key="PublicName" value="My Server" />
        <input class="item-input" data-key="MaxPlayers" value="32" />
      </div>
    `;

    state.modsItems = ["modA", "modB"];
    state.workshopItemsItems = ["123"];
    state.mapItems = ["Muldraugh"];

    const items = gatherConfigItems();

    expect(items).toContainEqual({ key: "PublicName", value: "My Server" });
    expect(items).toContainEqual({ key: "MaxPlayers", value: "32" });
    expect(items).toContainEqual({ key: "Mods", value: "modA;modB" });
    expect(items).toContainEqual({ key: "WorkshopItems", value: "123" });
    expect(items).toContainEqual({ key: "Map", value: "Muldraugh" });
  });

  it("gatherConfigItems collects toggle values", () => {
    document.body.innerHTML = `
      <div id="normalItemsList">
        <div class="toggle">
          <input type="checkbox" data-key="PVP" />
        </div>
        <div class="toggle">
          <input type="checkbox" data-key="PauseEmpty" checked />
        </div>
      </div>
    `;

    state.modsItems = [];
    state.workshopItemsItems = [];
    state.mapItems = [];

    const items = gatherConfigItems();

    expect(items).toContainEqual({ key: "PVP", value: "false" });
    expect(items).toContainEqual({ key: "PauseEmpty", value: "true" });
  });

  it("auto-saves mod deletions to the config API", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });

    state.modsItems = ["modA", "modB"];
    renderMods();
    document.querySelector("#modsList .list-item .list-button.delete").click();

    expect(state.isDirty).toBe(true);

    await vi.advanceTimersByTimeAsync(600);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/config?serverId=server-1");
    expect(options.method).toBe("PUT");
    const body = JSON.parse(options.body);
    expect(body.items).toContainEqual({ key: "Mods", value: "modB" });
    expect(state.isDirty).toBe(false);
  });

  it("auto-saves mods added through the dialog", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });

    state.modsItems = ["modA"];
    addListItem("Mods");
    document.getElementById("dialogInput").value = "modB";
    confirmAddItem();

    await vi.advanceTimersByTimeAsync(600);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.items).toContainEqual({ key: "Mods", value: "modA;modB" });
    expect(state.isDirty).toBe(false);
  });
});
