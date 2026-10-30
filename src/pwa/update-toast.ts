// The notice that appears when a newer version is on the device: a small card under the top bar (on the roadmap the page shows its own at its foot). "Update now" reloads the app on the new version; "Later",
// or leaving it alone for a while, hides it until the app is opened again (the Version page of Settings keeps the way to update). It rests on
// nothing but the top bar's edge, so it never covers a question or the keyboard, and it stays while the pointer or the focus is on it.
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
  const words = () => (text.textContent = updates.readyText ? updates.readyText() : "New version ready.");
  words();
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
  // it stays while the pointer or the focus is on it, and counts down again only when neither is
  let hovered = false;
  const settle = () => {
    if (toast.hidden) return;
    if (hovered || toast.contains(document.activeElement)) clearTimeout(timer);
    else wait();
  };
  toast.addEventListener("pointerenter", () => { hovered = true; settle(); });
  toast.addEventListener("pointerleave", () => { hovered = false; settle(); });
  toast.addEventListener("focusin", settle);
  toast.addEventListener("focusout", () => setTimeout(settle, 0)); // the focus has moved on (or out) only after this event
  const show = () => {
    words();
    const was = toast.hidden;
    toast.hidden = dismissed || updates.status() !== "ready";
    if (was && !toast.hidden) wait();
  };
  updates.subscribe(show);
  show();
}
