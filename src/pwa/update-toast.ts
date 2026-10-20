// The notice that appears when a newer version is on the device: a small card under the top bar. "Update now" reloads the app on the new version; "Later",
// or leaving it alone for a while, hides it until the app is opened again (the version line of the menu and Settings keep the way to update). It rests on
// nothing but the top bar's edge, so it never covers a question, the pair bar or the keyboard, and it stays while the pointer or the focus is on it.
import type { Updates } from "../platform/types";

const STAYS_MS = 20_000;

export function mountUpdateToast(updates: Updates): void {
  let dismissed = false;
  let timer = 0;
  const toast = document.createElement("div");
  toast.id = "upd";
  toast.setAttribute("role", "status");
  toast.hidden = true;
  const dismiss = () => {
    dismissed = true;
    clearTimeout(timer);
    toast.hidden = true;
  };
  const text = document.createElement("span");
  text.textContent = "New version ready.";
  const now = document.createElement("button");
  now.type = "button";
  now.className = "btn";
  now.textContent = "Update now";
  now.addEventListener("click", () => updates.apply());
  const later = document.createElement("button");
  later.type = "button";
  later.className = "btn ghost";
  later.textContent = "Later";
  later.addEventListener("click", () => dismiss());
  toast.append(text, now, later);
  document.body.append(toast);
  const wait = () => {
    clearTimeout(timer);
    timer = window.setTimeout(dismiss, STAYS_MS);
  };
  const hold = () => clearTimeout(timer);
  toast.addEventListener("pointerenter", hold);
  toast.addEventListener("focusin", hold);
  toast.addEventListener("pointerleave", wait);
  toast.addEventListener("focusout", wait);
  const show = () => {
    const was = toast.hidden;
    toast.hidden = dismissed || updates.status() !== "ready";
    if (was && !toast.hidden) wait();
  };
  updates.subscribe(show);
  show();
}
