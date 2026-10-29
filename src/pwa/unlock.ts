// Key handling for the course part of the term data (docs/DATA.md). The study group's link carries the Magic Key after
// the "#" (https://.../#k=lotus-river-candle-stone). Browsers never send that part to a server. The key is kept
// on this device, so the app unlocks again without the link; the definitions it unlocks come from the server (./course.ts).
import { parseMagicKey } from "../ai/magic-key";
import { MAGIC_KEY_NOTE } from "../ui/magic-key-note";

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
const DECLINED = "riglam.keyDeclined";
/** True after the reader forgot the key on this device: an account that carries it does not hand it back until the reader asks (a key typed or linked, a sign-in). */
export const keyDeclined = () => get("localStorage", DECLINED) === "1" || get("sessionStorage", DECLINED) === "1"; // where the key itself is kept, it is read from both
export const declineKey = () => void (set("localStorage", DECLINED, "1") || set("sessionStorage", DECLINED, "1"));
export function allowKey() {
  for (const s of ["localStorage", "sessionStorage"] as const) try { window[s].removeItem(DECLINED); } catch { /* storage unavailable */ }
}
export function storeKey(key: string) {
  const kept = set("localStorage", KEY, key) || set("sessionStorage", KEY, key);
  if (kept) allowKey();
  return kept;
}
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
 * Takes a key typed or pasted (words with spaces or dashes, in any case, or the whole link): `verify(key)` asks the server, and a key it opens the
 * definitions with is kept and taken into the running page by `apply(key)`; with no `apply`, or when it fails or resolves false, the page is reloaded so it
 * starts unlocked. Resolves with null when the key was taken, or with the sentence to show when it was not. The prompt below and Settings' Magic Key page use it.
 */
export async function takeKey(text: string, verify: (key: string) => Promise<string | null>, apply?: (key: string) => Promise<boolean>): Promise<string | null> {
  const key = parseMagicKey(text);
  if (!key) return "That does not look like a Magic Key, which is four words in a row.";
  let why: string | null;
  try {
    why = await verify(key);
  } catch {
    why = "The server could not check the key just now. Try again later.";
  }
  if (why) return why;
  storeKey(key);
  let taken = false;
  try { taken = (await apply?.(key)) ?? false; } catch { /* the reload below starts the page with the key */ }
  if (!taken) location.reload();
  return null;
}

/**
 * Tells a reader without a key how to get one, and takes the key if it is typed or pasted (words with spaces or dashes, in any
 * case, or the whole link). `verify(key)` asks the server and resolves with `null` when the key opens the definitions, or with the
 * sentence to show when it does not. The key is then kept and `apply(key)` takes it into the running page (resolving true), so what
 * the reader was doing stays; with no `apply`, or when it fails or resolves false, the page is reloaded so it starts unlocked.
 * Never shown to a reader who has simply not got a key: the page opens it when the reader reaches something that needs the
 * key (Explain, the definitions, Options). Only a problem to report (a link whose key does not fit) opens it by itself.
 * Returns the function that opens it; what it returns settles when the prompt is closed: true if a key was taken, otherwise false.
 */
export function showUnlock({ problem = null, verify, apply }: { problem?: string | null; verify: (key: string) => Promise<string | null>; apply?: (key: string) => Promise<boolean> }): () => Promise<boolean> {
  const closed = (dlg: HTMLDialogElement) => new Promise<boolean>((done) => dlg.addEventListener("close", () => done(dlg.dataset.taken === "1"), { once: true }));
  const build = (): Promise<boolean> => {
    const open = document.getElementById("unlock") as HTMLDialogElement | null;
    if (open) { if (!open.open) open.showModal(); return closed(open); }
    const dlg = document.createElement("dialog");
    dlg.id = "unlock";
    dlg.setAttribute("aria-labelledby", "unlock-h");
    dlg.innerHTML = `<form method="dialog">
      <h2 id="unlock-h"><svg class="ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3m-4 4 3 3m-5.5-.5 2 2"/></svg>Enter the <button type="button" class="keyname" id="unlock-mk-btn" aria-expanded="false" aria-controls="unlock-mk">Magic Key</button></h2>
      <div class="pop" id="unlock-mk" hidden>${MAGIC_KEY_NOTE.map((t) => `<p>${t}</p>`).join("")}<button type="button" class="popx" id="unlock-mk-hide">Hide</button></div>
      <p>The Magic Key is four words that come with the course. Entered once, it unlocks the course’s definitions and notes on this device, so terms show what they mean, and the explanations of the AI tutor, which use them.</p>
      <p class="hint">Without it you can still practice. Ask your teacher or whoever shared the app with you.</p>
      <p id="unlock-err" class="err" role="alert" hidden></p>
      <input id="unlock-key" type="text" autofocus aria-label="Magic Key or link" placeholder="four words or the special link" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="text">
      <div class="row"><button type="submit" class="btn"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/></svg>Unlock</button><button type="button" class="btn ghost" id="unlock-skip">Close</button></div>
    </form>`;
    document.body.append(dlg);
    const input = dlg.querySelector<HTMLInputElement>("#unlock-key")!;
    const err = dlg.querySelector<HTMLElement>("#unlock-err")!;
    const say = (msg: string) => { err.textContent = msg; err.hidden = !msg; };
    if (problem) say(problem);
    const note = dlg.querySelector<HTMLElement>("#unlock-mk")!;
    const noteBtn = dlg.querySelector<HTMLElement>("#unlock-mk-btn")!;
    const showNote = (on: boolean) => { note.hidden = !on; noteBtn.setAttribute("aria-expanded", String(on)); };
    noteBtn.addEventListener("click", () => showNote(note.hasAttribute("hidden")));
    dlg.querySelector("#unlock-mk-hide")!.addEventListener("click", () => showNote(false));
    dlg.addEventListener("close", () => { if (dlg.dataset.taken === "1") dlg.remove(); });
    dlg.querySelector("#unlock-skip")!.addEventListener("click", () => dlg.close());
    dlg.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      say("");
      const submit = dlg.querySelector<HTMLButtonElement>("button[type=submit]")!;
      submit.disabled = true;
      const why = await takeKey(input.value, verify, apply);
      if (why) { submit.disabled = false; return say(why); }
      dlg.dataset.taken = "1";
      dlg.close();
    });
    dlg.showModal();
    return closed(dlg);
  };
  const when = (go: () => void) => (document.body ? go() : addEventListener("DOMContentLoaded", go, { once: true }));
  if (problem) when(() => void build());
  return () => new Promise<boolean>((done) => when(() => void build().then(done)));
}

