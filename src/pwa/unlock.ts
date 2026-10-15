// Key handling for the course part of the term data (docs/DATA.md). The study group's link carries the key after
// the "#" (https://.../#k=<key>). Browsers never send that part to a server, so the host only ever holds the
// encrypted definitions. The key is kept on this device, so the app unlocks again offline and without the link.
import { parseKey } from "../data/course.js";

const KEY = "riglam.dataKey";
const DISMISSED = "riglam.unlockDismissed";

type StoreName = "localStorage" | "sessionStorage";

const get = (store: StoreName, k: string) => { try { return window[store].getItem(k); } catch { return null; } };
const set = (store: StoreName, k: string, v: string) => { try { window[store].setItem(k, v); return true; } catch { return false; } };

/** Takes a key out of the address at once, so it does not stay in the address bar or in the history. */
export function takeLinkKey(): { present: boolean; key: string | null } {
  const hash = location.hash;
  if (!/^#k=/.test(hash)) return { present: false, key: null };
  history.replaceState(history.state, "", location.pathname + location.search);
  return { present: true, key: parseKey(hash) };
}

export const storedKey = (): string | null => parseKey(get("localStorage", KEY) ?? get("sessionStorage", KEY));
export const storeKey = (key: string) => set("localStorage", KEY, key) || set("sessionStorage", KEY, key);
export function forgetKey() {
  for (const s of ["localStorage", "sessionStorage"] as const) try { window[s].removeItem(KEY); } catch { /* storage unavailable */ }
}

/**
 * Tells a reader without a key how to get one, and takes the key if it is pasted. `verify(key)` resolves when the
 * key opens the definitions and rejects when it does not; the page is then reloaded so it starts unlocked.
 * Shown on its own once per visit: "Not now" is remembered until the tab is closed, unless there is a problem to report.
 * Returns a function that opens the dialog again whenever the reader asks for it (the Options row), "Not now" or not.
 */
export function showUnlock({ problem = null, verify }: { problem?: string | null; verify: (key: string) => Promise<unknown> }): () => void {
  const build = () => {
    const open = document.getElementById("unlock") as HTMLDialogElement | null;
    if (open) { if (!open.open) open.showModal(); return; }
    const dlg = document.createElement("dialog");
    dlg.id = "unlock";
    dlg.setAttribute("aria-labelledby", "unlock-h");
    dlg.innerHTML = `<form method="dialog">
      <h2 id="unlock-h">The definitions are locked</h2>
      <p>The terms, translations and relations work without a key. The definitions follow the course booklet, and the tutor (Explain) answers from it, so both open only with the link your study group shared. Open that link once on this device, or paste the link (or just its key) here.</p>
      <p id="unlock-err" class="err" role="alert" hidden></p>
      <label for="unlock-key">Link or key</label>
      <input id="unlock-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url">
      <div class="row"><button type="submit" class="btn">Unlock</button><button type="button" class="btn ghost" id="unlock-skip">Not now</button></div>
    </form>`;
    document.body.append(dlg);
    const input = dlg.querySelector<HTMLInputElement>("#unlock-key")!;
    const err = dlg.querySelector<HTMLElement>("#unlock-err")!;
    const say = (msg: string) => { err.textContent = msg; err.hidden = !msg; };
    if (problem) say(problem);
    dlg.querySelector("#unlock-skip")!.addEventListener("click", () => { set("sessionStorage", DISMISSED, "1"); dlg.close(); });
    dlg.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = parseKey(input.value);
      if (!key) return say("That is not a key. Paste the whole link or the key from it.");
      try {
        await verify(key);
      } catch {
        return say("That key does not open the definitions.");
      }
      storeKey(key);
      location.reload();
    });
    dlg.showModal();
  };
  const when = (go: () => void) => (document.body ? go() : addEventListener("DOMContentLoaded", go, { once: true }));
  if (problem || !get("sessionStorage", DISMISSED)) when(build);
  return () => when(build);
}

