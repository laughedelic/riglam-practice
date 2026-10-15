// Shown when the browser's storage for this app did not answer in time (src/pwa/local-db.ts): the app has started without the saved answers,
// and what is done now is not kept on this device. A reload often brings the storage back. The bar also says whether a new, empty database
// opens, which tells a stuck store of this app from a browser whose storage as a whole does not answer.

/** Opens and deletes a database with a name of its own; says how that went. */
function probe(wait = 5000): Promise<string> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const stuck = "A new test database did not open either: the browser's storage as a whole is not answering.";
    const timer = setTimeout(() => resolve(stuck), wait);
    const done = (text: string) => {
      clearTimeout(timer);
      resolve(text);
    };
    try {
      const req = indexedDB.open("riglam-probe");
      req.onsuccess = () => {
        req.result.close();
        try { indexedDB.deleteDatabase("riglam-probe"); } catch { /* a leftover empty database is harmless */ }
        done(`A new test database opened in ${Math.round(performance.now() - t0)} ms: only this app's saved data is stuck.`);
      };
      req.onerror = () => done("A new test database could not be made: the browser refuses storage here.");
    } catch {
      done("A new test database could not be made: the browser refuses storage here.");
    }
  });
}

export function showStorageNotice(): void {
  if (document.getElementById("store")) return;
  const bar = document.createElement("div");
  bar.id = "store";
  bar.setAttribute("role", "alert");
  const text = document.createElement("span");
  text.textContent = "This device's storage is not answering, so your saved answers are not shown and new ones are not saved. Reloading may help.";
  const detail = document.createElement("span");
  detail.className = "detail";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => location.reload());
  bar.append(text, detail, reload);
  document.body.append(bar);
  void probe().then((t) => { detail.textContent = t; });
}
