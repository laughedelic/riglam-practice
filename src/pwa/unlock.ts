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
/** What the Magic Key page says to a reader whose kept key stopped fitting: the Magic Key was changed. */
export const KEY_CHANGED_TEXT = "The Magic Key has changed. Open the new link or paste it here to keep the definitions and Claude.";
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
 * starts unlocked. Resolves with null when the key was taken, or with the sentence to show when it was not. Settings' Magic Key page uses it.
 */
export async function takeKey(text: string, verify: (key: string) => Promise<string | null>, apply?: (key: string) => Promise<boolean>): Promise<string | null> {
  const key = parseMagicKey(text);
  if (!key) return "That does not look like the Magic Key or its link.";
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
