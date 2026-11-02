import type { StorageHealth } from "../platform/types";
import { startNewStore } from "./store-slot";

// Where the device's storage stands, for the page to say (the pinned line and the Storage page of Settings, src/app/path/storage.tsx). src/pwa/local-db.ts reports that
// it did not answer in time (`stuck`: the app goes on without the saved answers, and what is done now is not kept on this device) and that it answered after all
// (`answers`). While it is stuck a test database is opened and deleted, which tells a stuck store of this app from a browser whose storage as a whole does not answer.
// A reload often brings the storage back; a new, empty store (./store-slot.ts) is the way out when it does not.

/** Opens and deletes a database with a name of its own; says how that went. */
function probe(wait: number): Promise<string> {
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

export interface StorageWatch extends StorageHealth {
  /** The store gave up on the storage. */
  stuck(): void;
  /** The store has the storage back. */
  answers(): void;
}

export function createStorageWatch(probeMs = 5000): StorageWatch {
  let bad = false, had = false, said: string | null = null;
  const listeners = new Set<() => void>();
  const tell = () => { for (const fn of [...listeners]) { try { fn(); } catch { /* a listener's failure is not the storage's */ } } };
  return {
    answering: () => !bad,
    troubled: () => had,
    probe: () => said,
    stuck() {
      if (bad) return;
      bad = had = true;
      said = null;
      tell();
      void probe(probeMs).then((text) => { if (bad) { said = text; tell(); } });
    },
    answers() {
      if (!bad) return;
      bad = false;
      said = null;
      tell();
    },
    useNewStore() {
      startNewStore();
      location.reload();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
