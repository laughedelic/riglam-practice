// The prompt that appears when a newer version is on the device: "Update now" reloads the app on it, "Later" hides the prompt until the
// app is opened again (Options keeps the button). It is a thin bar at the bottom edge, clear of the safe area, so it never covers a question.
import type { Updates } from "../platform/types";

export function mountUpdateBanner(updates: Updates): void {
  let dismissed = false;
  const bar = document.createElement("div");
  bar.id = "upd";
  bar.setAttribute("role", "status");
  bar.hidden = true;
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
  later.addEventListener("click", () => {
    dismissed = true;
    bar.hidden = true;
  });
  bar.append(text, now, later);
  document.body.append(bar);
  const show = () => {
    bar.hidden = dismissed || updates.status() !== "ready";
  };
  updates.subscribe(show);
  show();
}
