// Shown when the browser's storage for this app did not answer in time (src/pwa/local-db.ts): the app has started without the saved answers,
// and what is done now is not kept on this device. A reload often brings the storage back.
export function showStorageNotice(): void {
  if (document.getElementById("store")) return;
  const bar = document.createElement("div");
  bar.id = "store";
  bar.setAttribute("role", "alert");
  const text = document.createElement("span");
  text.textContent = "This device's storage is not answering, so your saved answers are not shown and new ones are not saved. Reloading may help.";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => location.reload());
  bar.append(text, reload);
  document.body.append(bar);
}
