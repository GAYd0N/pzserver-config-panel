// @vitest-environment happy-dom

import { describe, it, expect, beforeEach } from "vitest";
import { initTheme } from "../../public/js/theme.js";

describe("theme.js", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute("data-theme", "");
    document.body.innerHTML = `
      <button id="themeToggle"></button>
      <span id="themeToggleIcon"></span>
    `;
  });

  it("applies system theme by default when no preference saved", () => {
    initTheme();
    const applied = document.documentElement.getAttribute("data-theme");
    expect(["dark", "light"]).toContain(applied);
  });

  it("applies saved dark theme", () => {
    localStorage.setItem("pz-panel-theme", "dark");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies saved light theme", () => {
    localStorage.setItem("pz-panel-theme", "light");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("cycles theme on toggle click from dark to light", () => {
    localStorage.setItem("pz-panel-theme", "dark");
    initTheme();

    const toggle = document.getElementById("themeToggle");
    expect(toggle).not.toBeNull();
    toggle.click();

    expect(localStorage.getItem("pz-panel-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("cycles theme on toggle click from light to system", () => {
    localStorage.setItem("pz-panel-theme", "light");
    initTheme();

    const toggle = document.getElementById("themeToggle");
    toggle.click();

    expect(localStorage.getItem("pz-panel-theme")).toBe("system");
  });

  it("cycles theme on toggle click from system to dark", () => {
    localStorage.setItem("pz-panel-theme", "system");
    initTheme();

    const toggle = document.getElementById("themeToggle");
    toggle.click();

    expect(localStorage.getItem("pz-panel-theme")).toBe("dark");
  });
});
