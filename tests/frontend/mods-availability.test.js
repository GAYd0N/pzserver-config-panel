// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state } from "../../public/js/state.js";
import {
  refreshWorkshopAvailability,
  renderWorkshopAvailability,
} from "../../public/js/mods.js";

function availabilityItem(overrides = {}) {
  return {
    id: "1",
    status: "available",
    downloaded: false,
    title: "",
    fileSize: 0,
    visibility: 0,
    banned: false,
    bannedReason: "",
    error: "",
    ...overrides,
  };
}

describe("workshop availability UI", () => {
  let fetchMock;

  beforeEach(() => {
    state.workshopItemsItems = [];
    state.workshopItemsData = [];
    state.mapItems = [];
    state.configData = null;

    document.body.innerHTML = `
      <div id="workshopAvailabilityPanel" hidden></div>
      <button id="checkWorkshopBtn">检测失效</button>
      <div id="workshopItemsList"></div>
    `;

    fetchMock = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
    document.body.innerHTML = "";
  });

  it("pins failing items above the list and badges the matching rows", async () => {
    state.workshopItemsItems = ["1", "2"];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checkedAt: "2026-01-01T00:00:00.000Z",
        items: [
          availabilityItem({
            id: "1",
            status: "unavailable",
            title: "Broken Mod",
            error: "Steam result 9",
          }),
          availabilityItem({ id: "2" }),
        ],
      }),
    });

    await refreshWorkshopAvailability(true);

    const panel = document.getElementById("workshopAvailabilityPanel");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("检测到 1 个异常项目");
    expect(panel.querySelectorAll(".workshop-problem")).toHaveLength(1);

    const problem = panel.querySelector(".workshop-problem");
    expect(problem.dataset.itemId).toBe("1");
    expect(problem.textContent).toContain("Broken Mod");
    expect(problem.textContent).toContain("服务器可能无法启动");

    const badges = document.querySelectorAll("#workshopItemsList .workshop-fail-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("失效");

    const rows = document.querySelectorAll("#workshopItemsList .workshop-item");
    expect(rows[0].dataset.itemId).toBe("1");
    expect(rows[0].classList.contains("workshop-item-problem")).toBe(true);
    expect(rows[1].classList.contains("workshop-item-problem")).toBe(false);
  });

  it("shows an ok summary when every item is available", async () => {
    state.workshopItemsItems = ["2"];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checkedAt: "2026-01-01T00:00:00.000Z",
        items: [availabilityItem({ id: "2", status: "unlisted", visibility: 3 })],
      }),
    });

    await refreshWorkshopAvailability(true);

    const panel = document.getElementById("workshopAvailabilityPanel");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("未发现失效项目");
    expect(panel.querySelectorAll(".workshop-problem")).toHaveLength(0);
  });

  it("marks locally present items as usable instead of failing", async () => {
    state.workshopItemsItems = ["1"];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checkedAt: "2026-01-01T00:00:00.000Z",
        items: [
          availabilityItem({
            id: "1",
            status: "unavailable",
            downloaded: true,
            title: "Local Copy",
          }),
        ],
      }),
    });

    await refreshWorkshopAvailability(true);

    const problem = document.querySelector(".workshop-problem");
    expect(problem.classList.contains("warning")).toBe(true);
    expect(problem.textContent).toContain("本地可用");
    expect(problem.textContent).toContain("服务器仍可启动");

    const badge = document.querySelector("#workshopItemsList .workshop-fail-badge");
    expect(badge.textContent).toBe("本地可用");
  });

  it("reports request failures without pinning items", async () => {
    state.workshopItemsItems = ["1"];
    fetchMock.mockRejectedValue(new Error("网络错误"));

    await refreshWorkshopAvailability(true);

    const panel = document.getElementById("workshopAvailabilityPanel");
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain("检测失败：网络错误");
    expect(panel.querySelectorAll(".workshop-problem")).toHaveLength(0);
  });

  it("does not call the API when the list is empty", async () => {
    await refreshWorkshopAvailability(true);

    expect(fetchMock).not.toHaveBeenCalled();
    const panel = document.getElementById("workshopAvailabilityPanel");
    expect(panel.hidden).toBe(true);
    expect(renderWorkshopAvailability).toBeTypeOf("function");
  });

  it("skips repeated checks for the same list unless forced", async () => {
    state.workshopItemsItems = ["1"];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        checkedAt: "2026-01-01T00:00:00.000Z",
        items: [availabilityItem({ id: "1" })],
      }),
    });

    await refreshWorkshopAvailability(true);
    await refreshWorkshopAvailability(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await refreshWorkshopAvailability(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
