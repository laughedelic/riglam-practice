// Key handling for the course part of the term data (docs/DATA.md). The study group's link carries the key after
// the "#" (https://.../#k=<key>). Browsers never send that part to a server, so the host only ever holds the
// encrypted definitions. The key is kept on this device, so the app unlocks again offline and without the link.
import { parseKey } from "../data/course.js";

const KEY = "riglam.dataKey";

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
 * Never shown to a reader who has simply not got a key: the page opens it when the reader reaches something that needs the
 * key (Explain, the definitions, Options). Only a problem to report (a link whose key does not fit) opens it by itself.
 * Returns the function that opens it.
 */
export function showUnlock({ problem = null, verify }: { problem?: string | null; verify: (key: string) => Promise<unknown> }): () => void {
  const build = () => {
    const open = document.getElementById("unlock") as HTMLDialogElement | null;
    if (open) { if (!open.open) open.showModal(); return; }
    const dlg = document.createElement("dialog");
    dlg.id = "unlock";
    dlg.setAttribute("aria-labelledby", "unlock-h");
    dlg.innerHTML = `<form method="dialog">
      <h2 id="unlock-h">Enter the Magic Key</h2>
      <p>The terms, translations and relations work without it. The definitions follow the course booklet, and the tutor (Explain) answers from it, so both open only with the Magic Key, which comes in the link your study group shared. Open that link once on this device, or paste the link (or just the key from it) here.</p>
      <p id="unlock-err" class="err" role="alert" hidden></p>
      <label for="unlock-key">Link or Magic Key</label>
      <input id="unlock-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url">
      <div class="row"><button type="submit" class="btn">Unlock</button><button type="button" class="btn ghost" id="unlock-skip">Close</button></div>
    </form>`;
    document.body.append(dlg);
    const input = dlg.querySelector<HTMLInputElement>("#unlock-key")!;
    const err = dlg.querySelector<HTMLElement>("#unlock-err")!;
    const say = (msg: string) => { err.textContent = msg; err.hidden = !msg; };
    if (problem) say(problem);
    dlg.querySelector("#unlock-skip")!.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = parseKey(input.value);
      if (!key) return say("That is not a Magic Key. Paste the whole link or the key from it.");
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
  if (problem) when(build);
  return () => when(build);
}

