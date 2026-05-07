// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { state } from "../../public/js/state.js";

describe("state.js", () => {
  it("initializes with correct default values", () => {
    expect(state.configData).toBeNull();
    expect(state.normalItems).toEqual([]);
    expect(state.modsItems).toEqual([]);
    expect(state.workshopItemsItems).toEqual([]);
    expect(state.workshopItemsData).toEqual([]);
    expect(state.mapItems).toEqual([]);
    expect(state.groupedNormalItems).toEqual({});
    expect(state.serversConfig).toBeNull();
    expect(state.runtimeSnapshot).toBeNull();
    expect(state.currentServerId).toBeNull();
    expect(state.currentServer).toBeNull();
    expect(state.terminalEventSource).toBeNull();
    expect(state.commandSuggestions).toEqual([]);
    expect(state.selectedSuggestionIndex).toBe(-1);
    expect(state.autoScroll).toBe(true);
  });

  it("is mutable and allows setting values", () => {
    state.currentServerId = "test-server";
    expect(state.currentServerId).toBe("test-server");

    state.autoScroll = false;
    expect(state.autoScroll).toBe(false);

    state.commandSuggestions = ["cmd1", "cmd2"];
    expect(state.commandSuggestions).toEqual(["cmd1", "cmd2"]);

    // Reset for other tests
    state.currentServerId = null;
    state.autoScroll = true;
    state.commandSuggestions = [];
  });
});
