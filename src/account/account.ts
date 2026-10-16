// What the page shows and does about an account: who is signed in, the actions (create, sign in, add a passkey, sign out, delete),
// and the sync status. It joins the client, the passkeys of the browser and the sync engine, all given, so that the
// same code runs in the page and in the tests (a software authenticator and the Worker in the same process).
//
// An account is optional and the page works the same without one. The last known person is kept on the device so that
// the Account row and the sync queue are right when the app starts offline.

import { AccountFailure, type AccountClient } from "./client";
import { PasskeyError, type Passkeys } from "./passkeys";
import type { AccountInfo } from "./protocol";
import type { Sync, SyncStatus } from "./sync";

export interface Person {
  id: string;
  name: string;
  passkeys: number;
  /** the account carries the Magic Key: a device that signs in to it gets the key */
  hasKey: boolean;
}

export type Busy = "create" | "signin" | "passkey" | "signout" | "delete" | "sync";

export interface AccountView {
  /** the Account row is shown: the server has accounts on, or this device used one */
  available: boolean;
  /** this browser can make and use passkeys */
  supported: boolean;
  /** signed in, as far as this device knows (it may be offline) */
  person: Person | null;
  busy: Busy | null;
  /** what the last action came to; `bad` for a failure */
  message: { text: string; bad: boolean } | null;
  sync: SyncStatus;
}

export interface Account {
  view(): AccountView;
  subscribe(fn: (v: AccountView) => void): () => void;
  /** Reads what the device remembers, asks the server whether accounts are on, and confirms who is signed in. Never rejects. */
  start(): Promise<void>;
  signUp(name: string): Promise<void>;
  signIn(): Promise<void>;
  addPasskey(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  syncNow(): Promise<void>;
  /** the server said this device is not signed in (any more) */
  signedOut(): void;
  /** the connection is back, or the page is in view again: send and receive soon */
  wake(): void;
  /** Another tab changed who is signed in (it wrote the kept person): follow it. Never rejects. */
  reconcile(): Promise<void>;
  dismiss(): void;
}

export interface AccountDeps {
  client: AccountClient;
  sync: Sync;
  passkeys: Passkeys;
  /** the last known person, kept on the device */
  keep: { read(): Person | null; write(person: Person | null): void };
  /** the headers that show the sender has the Magic Key; used when an account is made and when it is asked to carry the key */
  proof?: () => Promise<Record<string, string>>;
  /**
   * The Magic Key on this device. A signed-in account that does not carry the key is asked to, when this device has it; a device without
   * the key takes it from an account that carries it (`adopt` stores it and starts the page again, unlocked).
   */
  magicKey?: { read(): string | null; adopt(key: string): void };
}

const MESSAGES = {
  cancelled: "Cancelled. Nothing was changed.",
  exists: "This device already has a passkey for this app. Use Sign in.",
  unsupported: "This browser cannot make or use passkeys.",
  failed: "The passkey did not work. Nothing was changed.",
  offline: "No connection. Nothing was changed.",
  signed_out: "You are not signed in.",
  unknown_passkey: "This app does not know that passkey. Create an account, or choose the passkey you made for this app.",
  conflict: "That passkey is already registered.",
  unavailable: "Accounts are not available right now. Nothing was changed.",
  bad_request: "That did not work. Nothing was changed.",
} as const;

/** The sentence for a failure; the server's own wording where it says something the person can act on. */
export function explain(e: unknown): { text: string; bad: boolean } {
  if (e instanceof PasskeyError) return { text: MESSAGES[e.code], bad: e.code !== "cancelled" };
  if (e instanceof AccountFailure) {
    if (e.code === "not_granted" || e.code === "quota" || e.code === "full" || e.code === "too_large") return { text: (e.message[0]?.toUpperCase() ?? "") + e.message.slice(1) + ".", bad: true };
    return { text: (MESSAGES as Record<string, string>)[e.code] ?? MESSAGES.failed, bad: true };
  }
  return { text: MESSAGES.failed, bad: true };
}

const personOf = (u: AccountInfo): Person => ({ id: u.id, name: u.name, passkeys: u.passkeys, hasKey: u.hasKey === true });

export function createAccount(deps: AccountDeps): Account {
  const { client, sync, passkeys, keep } = deps;
  let v: AccountView = {
    available: false,
    supported: passkeys.supported(),
    person: null,
    busy: null,
    message: null,
    sync: sync.status(),
  };
  const listeners = new Set<(v: AccountView) => void>();
  const set = (patch: Partial<AccountView>) => {
    v = { ...v, ...patch };
    for (const fn of [...listeners]) { try { fn(v); } catch { /* a listener's failure is its own */ } }
  };
  sync.subscribe((s) => set({ sync: s }));

  // The server could not be asked at start (offline, or no answer in time): ask again whenever the page wakes, until it answers, so that the row appears without a reload.
  let unknown = false;
  let asking = false;
  async function discover() {
    if (!unknown || asking || v.person) return;
    asking = true;
    try {
      const on = await client.available();
      if (on === null) return;
      unknown = false;
      if (on) set({ available: true });
    } finally {
      asking = false;
    }
  }

  function signedOut() {
    sync.deactivate();
    keep.write(null);
    if (v.person) set({ person: null, message: { text: "You were signed out. Sign in again to keep syncing.", bad: false } });
  }

  // Changes of account run one after the other: two that overlapped could finish in either order and leave the queue of one person under the name of another.
  // Each checks, when its turn comes, that the person it was for is still the one shown, and a later change has replaced it if not.
  let transitions: Promise<unknown> = Promise.resolve();
  const activate = (id: string): Promise<void> => {
    const run = transitions.then(async () => { if (v.person?.id === id) await sync.activate(id); });
    transitions = run.catch(() => {});
    return run;
  };

  async function adopt(p: Person) {
    keep.write(p);
    set({ person: p, available: true });
    await activate(p.id);
    await shareKey(p);
  }

  /** Makes the account and the device agree about the Magic Key. Never throws: the key is a convenience, and the next sign-in tries again. */
  async function shareKey(p: Person) {
    const magic = deps.magicKey;
    if (!magic) return;
    try {
      const have = magic.read();
      if (have && !p.hasKey) {
        await client.shareKey((await deps.proof?.()) ?? {});
        // A sign-out or another account may have come while the request was under way: only the person who is signed in now is marked, with their current fields.
        if (v.person?.id === p.id) {
          const carried = { ...v.person, hasKey: true };
          keep.write(carried);
          set({ person: carried });
        }
      } else if (!have && p.hasKey) {
        const key = await client.fetchKey();
        // The request may outlast a sign-out or an account switch: the key of an account that is not signed in here any more is not taken, nor one the device got meanwhile.
        if (v.person?.id === p.id && !magic.read()) magic.adopt(key);
      }
    } catch { /* offline, or the key no longer fits */ }
  }

  /** Makes this tab show and track `who`, the person another tab (or the server) says is signed in, or null. */
  async function reconcileWith(who: Person | null) {
    if (!who) {
      if (v.person) { sync.deactivate(); set({ person: null, message: { text: "You were signed out. Sign in again to keep syncing.", bad: false } }); }
      return;
    }
    if (v.person?.id === who.id) {
      if (v.person.name !== who.name || v.person.passkeys !== who.passkeys || v.person.hasKey !== who.hasKey) set({ person: who });
      return;
    }
    keep.write(who);
    set({ person: who, available: true });
    await activate(who.id);
  }

  /** Runs one action: one at a time, with its failure shown as a message. */
  async function act(busy: Busy, fn: () => Promise<string | void>) {
    if (v.busy) return;
    set({ busy, message: null });
    try {
      const text = await fn();
      set({ busy: null, message: text ? { text, bad: false } : null });
    } catch (e) {
      set({ busy: null, message: explain(e) });
    }
  }

  return {
    view: () => v,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    async start() {
      try {
        const hadAccount = (await sync.resume()) !== null;
        const remembered = keep.read(); // after the wait: another tab may have changed the person meanwhile
        if (remembered) {
          set({ person: remembered, available: true });
          await activate(remembered.id);
        }
        const on = await client.available();
        // The server says accounts are off: that is the answer, however this device was signed in (no answer at all is not).
        if (on === false && v.person) { sync.deactivate(); keep.write(null); set({ person: null }); }
        set({ available: on === true || (on === null && (!!remembered || hadAccount)) });
        unknown = on === null && !v.available;
        if (remembered && on !== false) {
          // confirm in the background: the sync above already runs on what was remembered
          // The answer is dropped when the person shown here has changed since (a sign-out or sign-in that finished first).
          const asked = remembered.id;
          const same = () => v.person?.id === asked;
          void client.me().then(
            (me) => { if (same()) return me.signedIn ? adopt(personOf(me.user)) : signedOut(); },
            () => {},
          );
        }
      } catch { /* the page works without it */ }
    },

    signUp: (name) =>
      act("create", async () => {
        const proof = (await deps.proof?.()) ?? {}; // the server asks for it again when the sign-up is verified
        const started = await client.registerOptions(name.trim(), proof);
        const response = await passkeys.create(started.options);
        const me = await client.registerVerify(started.challengeId, response, proof);
        await adopt(personOf(me.user));
        return "Account created. What this device keeps is being copied to it.";
      }),

    signIn: () =>
      act("signin", async () => {
        const started = await client.loginOptions();
        const response = await passkeys.get(started.options);
        const me = await client.loginVerify(started.challengeId, response);
        await adopt(personOf(me.user));
        return "Signed in. Your documents are being brought together.";
      }),

    addPasskey: () =>
      act("passkey", async () => {
        const started = await client.passkeyOptions();
        const response = await passkeys.create(started.options);
        const { passkeys: n } = await client.passkeyVerify(started.challengeId, response);
        if (v.person) { const p = { ...v.person, passkeys: n }; keep.write(p); set({ person: p }); }
        return "Passkey added.";
      }),

    signOut: () =>
      act("signout", async () => {
        const who = v.person?.id;
        await sync.syncNow().catch(() => {}); // what is waiting goes first, if the server can be reached
        // The session cookie is shared by all tabs: if another tab signed in as someone else meanwhile, that is not the session to end here.
        const me = await client.me();
        if (me.signedIn && me.user.id !== who) {
          await reconcileWith(personOf(me.user));
          throw new AccountFailure("signed_out");
        }
        await client.logout();
        sync.deactivate();
        keep.write(null);
        set({ person: null });
        return "Signed out. This device keeps its documents, and the changes made from now on are sent when you sign in again.";
      }),

    deleteAccount: () =>
      act("delete", async () => {
        // The session cookie is shared by all tabs, so confirm that it is still the account shown here before deleting anything.
        const me = await client.me();
        if (!me.signedIn || me.user.id !== v.person?.id) {
          await reconcileWith(me.signedIn ? personOf(me.user) : null);
          throw new AccountFailure("signed_out");
        }
        await client.deleteAccount();
        await sync.forget();
        keep.write(null);
        set({ person: null });
        return "Account deleted, with the copy of your documents on the server. This device keeps its own.";
      }),

    syncNow: () =>
      act("sync", async () => {
        const s = await sync.syncNow();
        if (s.error === "offline") throw new AccountFailure("offline");
        if (s.error) throw new AccountFailure(s.error === "signed_out" ? "signed_out" : s.error === "quota" ? "quota" : s.error === "full" ? "full" : "unavailable", s.error === "quota" ? "this account has reached its limit for today" : s.error === "full" ? "this account holds as many documents as it may" : s.error);
      }),

    signedOut,

    async reconcile() {
      try { await reconcileWith(keep.read()); } catch { /* the next start asks the server */ }
    },

    wake() {
      if (v.person) sync.kick();
      else void discover().catch(() => {});
    },

    dismiss() {
      set({ message: null });
    },
  };
}
