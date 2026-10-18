// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../public/js/state.js";
import { autoSortMods, renderMods, addListItem, confirmAddItem } from "../../public/js/mods.js";

describe("mods.js", () => {
  beforeEach(() => {
    // Reset state
    state.modsItems = [];
    state.workshopItemsData = [];
    state.workshopItemsItems = [];
    state.mapItems = [];
    state.configData = null;
    state.isDirty = false;
    state.configRevision = 0;

    // Set up required DOM elements
    document.body.innerHTML = `
      <div id="modsList"></div>
      <div id="toastContainer"></div>
      <div id="addItemDialog" class="dialog-overlay">
        <h3 id="dialogTitle"></h3>
        <label id="dialogLabel"></label>
        <input id="dialogInput" />
      </div>
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

  it("deletes a mod from state and re-renders the list", () => {
    state.modsItems = ["modA", "modB"];
    renderMods();

    document.querySelector("#modsList .list-item .list-button.delete").click();

    expect(state.modsItems).toEqual(["modB"]);
    expect(state.isDirty).toBe(true);
    expect(document.querySelectorAll("#modsList .list-item")).toHaveLength(1);
  });

  it("adds a mod from the dialog and marks configuration dirty", () => {
    state.modsItems = ["modA"];

    addListItem("Mods");
    document.getElementById("dialogInput").value = "modB";
    confirmAddItem();

    expect(state.modsItems).toEqual(["modA", "modB"]);
    expect(state.isDirty).toBe(true);
    expect(document.getElementById("addItemDialog").classList.contains("active")).toBe(false);
  });

  it("moves a mod to the end of the load order with the 置低 button", () => {
    state.modsItems = ["modA", "modB", "modC"];
    renderMods();

    const firstRow = document.querySelector("#modsList .list-item");
    const lastButton = firstRow.querySelector(".list-button.move-last");
    expect(lastButton.disabled).toBe(false);

    lastButton.click();

    expect(state.modsItems).toEqual(["modB", "modC", "modA"]);
    expect(state.isDirty).toBe(true);

    const rows = document.querySelectorAll("#modsList .list-item");
    expect(rows[2].querySelector(".list-item-input").value).toBe("modA");
    expect(rows[2].querySelector(".list-button.move-last").disabled).toBe(true);
  });

  it("supports manual ordering with the up and down buttons", () => {
    state.modsItems = ["modA", "modB", "modC"];
    renderMods();

    let rows = document.querySelectorAll("#modsList .list-item");
    rows[2].querySelector('button[title="上移"]').click();
    expect(state.modsItems).toEqual(["modA", "modC", "modB"]);

    rows = document.querySelectorAll("#modsList .list-item");
    rows[0].querySelector('button[title="下移"]').click();
    expect(state.modsItems).toEqual(["modC", "modA", "modB"]);
    expect(state.isDirty).toBe(true);
  });
});
