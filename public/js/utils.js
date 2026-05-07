export function showToast(message, type = "info") {
  const toastContainer = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    if (toastContainer.contains(toast)) {
      toastContainer.removeChild(toast);
    }
  }, 3000);
}

export function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function getStatusText(status) {
  const map = {
    stopped: "已停止",
    starting: "启动中",
    running: "运行中",
    stopping: "停止中",
    error: "错误",
    unknown: "未知"
  };
  return map[status] || status;
}

export function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}
