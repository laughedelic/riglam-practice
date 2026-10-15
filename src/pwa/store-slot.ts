// Which IndexedDB database holds this device's documents. Normally "riglam". When that one stops answering (src/pwa/storage-notice.ts), the
// reader can move the app to a new, empty one ("riglam-2", ...); the old one is left alone. A signed-in account then brings its documents back:
// the move asks sync to start from the beginning, since the cursor it kept belongs to the old store.
const STORE = "riglam.store";
const RESYNC = "riglam.resync";
const BASE = "riglam";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

export const storeName = (): string => {
  const kept = read(STORE);
  return kept && /^riglam(-\d+)?$/.test(kept) ? kept : BASE;
};

/** The name of the next database after `name`. */
export const nextStore = (name: string): string => `${BASE}-${(Number(name.slice(BASE.length + 1)) || 1) + 1}`;

/** Moves the app to a new store from the next start on. False when the choice could not be kept. */
export function startNewStore(): boolean {
  return write(STORE, nextStore(storeName())) && write(RESYNC, "1");
}

/** True once after `startNewStore`: sync fetches everything again. */
export function takeResync(): boolean {
  const was = read(RESYNC) === "1";
  try { localStorage.removeItem(RESYNC); } catch { /* storage unavailable */ }
  return was;
}
