const THEME_KEY = "pz-panel-theme";

const ICONS = {
  dark: "\u{1F319}",
  light: "\u{2600}\u{FE0F}",
  system: "\u{1F4BB}",
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
    icon.textContent = ICONS[mode] || ICONS.dark;
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
