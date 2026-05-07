// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../public/js/state.js";
import { autoSortMods } from "../../public/js/mods.js";

describe("mods.js", () => {
  beforeEach(() => {
    // Reset state
    state.modsItems = [];
    state.workshopItemsData = [];
    state.workshopItemsItems = [];
    state.mapItems = [];
    state.configData = null;

    // Set up required DOM elements
    document.body.innerHTML = `
      <div id="modsList"></div>
      <div id="toastContainer"></div>
    `;
  });

  function createWorkshopItem(id, subMods) {
    return { id, isDownloaded: true, subMods: subMods || [], maps: [] };
  }

  function createSubMod(overrides = {}) {
    return {
      name: "Test Mod",
      id: "TestMod",
      description: "",
      ...overrides,
    };
  }

  it("sorts mods in topological order based on require dependencies", () => {
    const modA = createSubMod({ id: "modA", require: ["modB"] });
    const modB = createSubMod({ id: "modB", require: [] });
    const modC = createSubMod({ id: "modC", require: ["modA"] });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB, modC]),
    ];

    state.modsItems = ["modC", "modA", "modB"];

    autoSortMods();

    expect(state.modsItems.indexOf("modB")).toBeLessThan(state.modsItems.indexOf("modA"));
    expect(state.modsItems.indexOf("modA")).toBeLessThan(state.modsItems.indexOf("modC"));
  });

  it("sorts mods with loadModBefore constraint", () => {
    const modA = createSubMod({ id: "modA", loadModBefore: ["modB"] });
    const modB = createSubMod({ id: "modB" });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB]),
    ];

    state.modsItems = ["modB", "modA"];

    autoSortMods();

    expect(state.modsItems.indexOf("modA")).toBeLessThan(state.modsItems.indexOf("modB"));
  });

  it("sorts mods with loadModAfter constraint", () => {
    const modA = createSubMod({ id: "modA", loadModAfter: ["modB"] });
    const modB = createSubMod({ id: "modB" });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB]),
    ];

    state.modsItems = ["modA", "modB"];

    autoSortMods();

    expect(state.modsItems.indexOf("modB")).toBeLessThan(state.modsItems.indexOf("modA"));
  });

  it("handles mods with backslash prefix", () => {
    const modA = createSubMod({ id: "modA", require: ["modB"] });
    const modB = createSubMod({ id: "modB" });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB]),
    ];

    state.modsItems = ["\\modA", "\\modB"];

    autoSortMods();

    const cleanMods = state.modsItems.map((m) => (m.startsWith("\\") ? m.substring(1) : m));
    expect(cleanMods.indexOf("modB")).toBeLessThan(cleanMods.indexOf("modA"));
  });

  it("keeps original backslash prefix after sorting", () => {
    const modA = createSubMod({ id: "modA", require: ["modB"] });
    const modB = createSubMod({ id: "modB" });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB]),
    ];

    state.modsItems = ["modA", "\\modB"];

    autoSortMods();

    // modB should come first (dependency), modA after
    const first = state.modsItems[0];
    const second = state.modsItems[1];
    expect(first.endsWith("modB")).toBe(true);
    expect(second.endsWith("modA")).toBe(true);
    // original prefix preserved
    expect(first).toBe("\\modB");
    expect(second).toBe("modA");
  });

  it("preserves order when no dependencies exist", () => {
    const modA = createSubMod({ id: "modA" });
    const modB = createSubMod({ id: "modB" });
    const modC = createSubMod({ id: "modC" });

    state.workshopItemsData = [
      createWorkshopItem("1", [modA, modB, modC]),
    ];

    state.modsItems = ["modC", "modB", "modA"];

    autoSortMods();

    // Without dependencies, should be alphabetically sorted
    expect(state.modsItems).toEqual(["modA", "modB", "modC"]);
  });
});
