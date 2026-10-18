let activeResolver = null;
let activeKeyHandler = null;
let lastFocusedElement = null;

function getDialog() {
  let overlay = document.getElementById("appConfirmDialog");
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = "appConfirmDialog";
  overlay.className = "dialog-overlay";
  overlay.innerHTML = `
    <div class="dialog-content dialog-confirm" role="dialog" aria-modal="true" aria-labelledby="appConfirmDialogTitle">
      <div class="dialog-header">
        <h3 id="appConfirmDialogTitle">确认操作</h3>
        <button class="dialog-close" type="button" data-confirm-close aria-label="关闭">&times;</button>
      </div>
      <div class="dialog-body">
        <p class="confirm-dialog-message"></p>
      </div>
      <div class="dialog-footer">
        <button class="dialog-button cancel" type="button" data-confirm-cancel>取消</button>
        <button class="dialog-button confirm" type="button" data-confirm-accept>确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function settle(result) {
  if (!activeResolver) {
    return;
  }

  const resolver = activeResolver;
  activeResolver = null;

  const overlay = getDialog();
  overlay.classList.remove("active");

  if (activeKeyHandler) {
    document.removeEventListener("keydown", activeKeyHandler);
    activeKeyHandler = null;
  }

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
  lastFocusedElement = null;

  resolver(result);
}

export function confirmAction(options = {}) {
  const {
    title = "确认操作",
    message = "",
    confirmText = "确认",
    cancelText = "取消",
    danger = false,
  } = options;

  if (activeResolver) {
    settle(false);
  }

  return new Promise((resolve) => {
    const overlay = getDialog();
    const titleEl = overlay.querySelector("#appConfirmDialogTitle");
    const messageEl = overlay.querySelector(".confirm-dialog-message");
    const closeBtn = overlay.querySelector("[data-confirm-close]");
    const cancelBtn = overlay.querySelector("[data-confirm-cancel]");
    const acceptBtn = overlay.querySelector("[data-confirm-accept]");

    titleEl.textContent = title;
    messageEl.textContent = message;
    cancelBtn.textContent = cancelText;
    acceptBtn.textContent = confirmText;
    acceptBtn.className = danger ? "dialog-button confirm danger" : "dialog-button confirm";

    closeBtn.onclick = () => settle(false);
    cancelBtn.onclick = () => settle(false);
    acceptBtn.onclick = () => settle(true);
    overlay.onclick = (event) => {
      if (event.target === overlay) {
        settle(false);
      }
    };

    activeKeyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
      }
    };
    document.addEventListener("keydown", activeKeyHandler);

    lastFocusedElement = document.activeElement;
    activeResolver = resolve;

    overlay.classList.add("active");
    setTimeout(() => {
      if (activeResolver === resolve) {
        (danger ? cancelBtn : acceptBtn).focus();
      }
    }, 50);
  });
}
