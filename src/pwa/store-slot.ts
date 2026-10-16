// Which IndexedDB database holds this device's documents. Normally "riglam". When that one stops answering (src/pwa/storage-notice.ts), the
// reader can move the app to a new, empty one ("riglam-2", ...); the old one is left alone. A signed-in account then brings its documents back:
// everything that belongs to a store has its own name (the outbox with the sync cursor, the sync lock, the tabs' channel), so the new store
// starts with no cursor and fetches everything, and a tab that still has the old store open goes on with the old names without touching it.
const STORE = "riglam.store";
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
  return write(STORE, nextStore(storeName()));
}

/** The outbox database (and the sync lock) of the store `name`; the first store keeps the name it always had. */
export const syncName = (name: string): string => `${name}-sync`;
