// The PWA's optional account: a passkey to sign in with and a server copy of the documents (docs/SERVER.md, "Accounts and sync").
// This file joins the pieces in src/account to the browser: the local store, IndexedDB for the outbox, the browser's passkeys,
// Web Locks so that only one tab syncs at a time, and the events that say when to try again.
import { createAccount, type Account, type Person } from "../account/account";
import { createAccountClient } from "../account/client";
import { idbOutbox } from "../account/idb-outbox";
import { createSync, type SyncStore } from "../account/sync";
import { browserPasskeys } from "../account/webauthn";
import { HEADER } from "../ai/protocol";
import { makeProof } from "../ai/proof";
import type { LocalDb } from "./local-db";
import { deviceId } from "./device";
import { storeName, syncName } from "./store-slot";

const KEPT = "riglam.account";
const POLL_MS = 60_000;

/** The person this device last knew to be signed in. Without usable storage nobody is remembered. */
const keep = {
  read(): Person | null {
    try {
      const v = JSON.parse(localStorage.getItem(KEPT) ?? "null");
      return v && typeof v.id === "string" && typeof v.name === "string" ? { id: v.id, name: v.name, passkeys: Number(v.passkeys) || 1, hasKey: v.hasKey === true } : null;
    } catch {
      return null;
    }
  },
  write(person: Person | null) {
    try {
      if (person) localStorage.setItem(KEPT, JSON.stringify(person));
      else localStorage.removeItem(KEPT);
    } catch { /* the next visit asks the server instead */ }
  },
};

/** One tab at a time runs a round of sync; the others leave it to that one. Without Web Locks every tab may run one (the server settles it). */
const exclusive = (lockName: string) => async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return fn();
  return locks.request(lockName, { ifAvailable: true }, async (lock) => (lock ? fn() : undefined));
};

const storeOf = (db: LocalDb): SyncStore => ({
  onWrite: (fn) => db.onWrite(fn),
  applyRemote: (col, id, data, revision) => db.applyRemote(col, id, data, revision),
  revision: (col, id) => db.revision(col, id),
  async documents(col) {
    const snap = await db.collection(col).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  },
  async read(col, id) {
    const snap = await db.doc(`${col}/${id}`).get();
    return snap.exists ? (snap.data() ?? null) : null;
  },
});

/** The account of this device. `magicKey` is the Magic Key on this device: `read` gives it (a new account needs its proof), `adopt` takes the one the account carries. */
export function createPwaAccount(db: LocalDb, magicKey: { read(): string | null; adopt(key: string): void }): Account {
  const client = createAccountClient();
  const syncDb = syncName(storeName()); // the cursor and the unsent changes belong to the store in use
  const outbox = idbOutbox(undefined, syncDb);
  const sync = createSync({
    store: storeOf(db),
    outbox,
    post: (request) => client.sync(request),
    exclusive: exclusive(syncDb),
    onSignedOut: () => account.signedOut(),
  });
  const account: Account = createAccount({
    client,
    sync,
    passkeys: browserPasskeys,
    keep,
    magicKey,
    proof: async (): Promise<Record<string, string>> => {
      const key = magicKey.read();
      if (!key) return {};
      const id = deviceId();
      return { [HEADER.device]: id, [HEADER.proof]: await makeProof(key, id) };
    },
  });

  // Another tab signed in, out or switched account: this tab's identity and write tracking follow it (localStorage tells the other tabs).
  addEventListener("storage", (e) => { if (e.key === KEPT || e.key === null) void account.reconcile(); });
  addEventListener("online", () => account.wake());
  addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") account.wake(); });
  setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) account.wake(); }, POLL_MS);
  void account.start();
  return account;
}
