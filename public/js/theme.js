const THEME_KEY = "pz-panel-theme";

const ICONS = {
  dark: `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  light: `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  system: `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
};

const LABELS = {
  dark: "暗色模式",
  light: "亮色模式",
  system: "跟随系统",
};

let systemMediaQuery = null;

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(mode) {
  if (mode === "system") return getSystemTheme();
  return mode;
}

function applyTheme(mode) {
  const theme = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", theme);
  updateToggleIcon(mode);
  updateToggleTitle(mode);
}

function updateToggleIcon(mode) {
  const icon = document.getElementById("themeToggleIcon");
  if (icon) {
    icon.innerHTML = ICONS[mode] || ICONS.dark;
  }
}

function updateToggleTitle(mode) {
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.title = LABELS[mode] || LABELS.dark;
  }
}

function cycleMode(current) {
  if (current === "dark") return "light";
  if (current === "light") return "system";
  return "dark";
}

function listenSystemChanges(mode) {
  if (systemMediaQuery) {
    systemMediaQuery.removeEventListener("change", onSystemChange);
    systemMediaQuery = null;
  }
  if (mode === "system") {
    systemMediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    systemMediaQuery.addEventListener("change", onSystemChange);
  }
}

function onSystemChange() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "system") {
    applyTheme("system");
  }
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const mode = saved || "system";
  applyTheme(mode);
  listenSystemChanges(mode);

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const current = localStorage.getItem(THEME_KEY) || "system";
      const next = cycleMode(current);
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      listenSystemChanges(next);
    });
  }
}
