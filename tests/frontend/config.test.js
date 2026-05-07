// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../public/js/state.js";
import { renderConfig, gatherConfigItems } from "../../public/js/config.js";

describe("config.js", () => {
  beforeEach(() => {
    state.configData = null;
    state.normalItems = [];
    state.modsItems = [];
    state.workshopItemsItems = [];
    state.workshopItemsData = [];
    state.mapItems = [];
    state.groupedNormalItems = {};

    document.body.innerHTML = `
      <div id="normalItemsList"></div>
      <div id="modsList"></div>
      <div id="workshopItemsList"></div>
      <div id="mapList"></div>
      <div id="availableMapsSection" style="display:none"></div>
      <div id="availableMapsList"></div>
    `;
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
});
