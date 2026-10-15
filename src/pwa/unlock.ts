// Key handling for the course part of the term data (docs/DATA.md). The study group's link carries the Magic Key after
// the "#" (https://.../#k=lotus-river-candle-stone). Browsers never send that part to a server. The key is kept
// on this device, so the app unlocks again without the link; the definitions it unlocks come from the server (./course.ts).
import { parseMagicKey } from "../ai/magic-key";

const KEY = "riglam.magicKey";
const OLD_KEY = "riglam.dataKey"; // the key of the first design, a random string: it fits nothing now

type StoreName = "localStorage" | "sessionStorage";

const get = (store: StoreName, k: string) => { try { return window[store].getItem(k); } catch { return null; } };
const set = (store: StoreName, k: string, v: string) => { try { window[store].setItem(k, v); return true; } catch { return false; } };

/** Takes a key out of the address at once, so it does not stay in the address bar or in the history. */
export function takeLinkKey(): { present: boolean; key: string | null } {
  const hash = location.hash;
  if (!/^#k=/.test(hash)) return { present: false, key: null };
  history.replaceState(history.state, "", location.pathname + location.search);
  return { present: true, key: parseMagicKey(hash) };
}

export const storedKey = (): string | null => parseMagicKey(get("localStorage", KEY) ?? get("sessionStorage", KEY));
export const storeKey = (key: string) => set("localStorage", KEY, key) || set("sessionStorage", KEY, key);
const CHANGED = "riglam.keyChanged";
/** What the prompt says to a reader whose kept key stopped fitting: the study group changed the Magic Key. */
export const KEY_CHANGED_TEXT = "The Magic Key was changed. Enter the new words (or open the new link) to keep reading the definitions and using the tutor.";
/** Notes that the server stopped accepting the kept key, so the next visit can say so once. */
export const markKeyChanged = () => set("localStorage", CHANGED, "1");
/** True once after `markKeyChanged`. */
export function takeKeyChanged(): boolean {
  const was = get("localStorage", CHANGED) === "1";
  try { localStorage.removeItem(CHANGED); } catch { /* storage unavailable */ }
  return was;
}
export function forgetKey() {
  for (const s of ["localStorage", "sessionStorage"] as const) for (const k of [KEY, OLD_KEY]) try { window[s].removeItem(k); } catch { /* storage unavailable */ }
}

/**
 * Tells a reader without a key how to get one, and takes the key if it is typed or pasted (words with spaces or dashes, in any
 * case, or the whole link). `verify(key)` asks the server and resolves with `null` when the key opens the definitions, or with the
 * sentence to show when it does not; the page is then reloaded so it starts unlocked.
 * Never shown to a reader who has simply not got a key: the page opens it when the reader reaches something that needs the
 * key (Explain, the definitions, Options). Only a problem to report (a link whose key does not fit) opens it by itself.
 * Returns the function that opens it.
 */
export function showUnlock({ problem = null, verify }: { problem?: string | null; verify: (key: string) => Promise<string | null> }): () => void {
  const build = () => {
    const open = document.getElementById("unlock") as HTMLDialogElement | null;
    if (open) { if (!open.open) open.showModal(); return; }
    const dlg = document.createElement("dialog");
    dlg.id = "unlock";
    dlg.setAttribute("aria-labelledby", "unlock-h");
    dlg.innerHTML = `<form method="dialog">
      <h2 id="unlock-h">Enter the Magic Key</h2>
      <p>The terms, translations and relations work without it. The definitions follow the course booklet, and the tutor (Explain) answers from it, so both open only with the Magic Key: four words, shared by your study group. Type or dictate them here, or paste the link, or open the link once on this device.</p>
      <p id="unlock-err" class="err" role="alert" hidden></p>
      <label for="unlock-key">Magic Key or link</label>
      <input id="unlock-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text">
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
      const key = parseMagicKey(input.value);
      if (!key) return say("That does not look like a Magic Key, which is four words in a row.");
      say("");
      const submit = dlg.querySelector<HTMLButtonElement>("button[type=submit]")!;
      submit.disabled = true;
      let why: string | null;
      try {
        why = await verify(key);
      } catch {
        why = "The server could not check the key just now. Try again later.";
      }
      submit.disabled = false;
      if (why) return say(why);
      storeKey(key);
      location.reload();
    });
    dlg.showModal();
  };
  const when = (go: () => void) => (document.body ? go() : addEventListener("DOMContentLoaded", go, { once: true }));
  if (problem) when(build);
  return () => when(build);
}

