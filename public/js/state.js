export const state = {
  configData: null,
  normalItems: [],
  modsItems: [],
  workshopItemsItems: [],
  workshopItemsData: [],
  mapItems: [],
  groupedNormalItems: {},

  serversConfig: null,
  runtimeSnapshot: null,
  currentServerId: null,
  currentServer: null,
  terminalEventSource: null,
  commandSuggestions: [],
  selectedSuggestionIndex: -1,
  autoScroll: true,

  isDirty: false,
  configRevision: 0,
};

export function markConfigDirty() {
  state.isDirty = true;
  state.configRevision += 1;
  document.dispatchEvent(new CustomEvent("config-dirty"));
}
