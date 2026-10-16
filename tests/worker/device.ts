// A device for the sync and account tests: a local store in memory, an outbox, a fetch that goes to the Worker in the same process
// (with a cookie jar, like a browser), and a software passkey. Nothing here is the code under test except what it is given.
import type { Doc } from "../../src/account/protocol";
import { createAccount, type Person } from "../../src/account/account";
import { createAccountClient } from "../../src/account/client";
import { memoryOutbox } from "../../src/account/outbox";
import { createSync, type SyncStore } from "../../src/account/sync";
import type { Passkeys } from "../../src/account/passkeys";
import { passkey, type Passkey } from "./authenticator";
import { ORIGIN, WHERE, type World } from "./accounts-support";

export const T0 = Date.parse("2026-10-13T09:00:00Z");
/** lets the promises of a write (noting it in the outbox) finish */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface Options {
  /** the passkey this device has; a new one when left out */
  key?: Passkey;
  /** sync's wait settings */
  backoffMs?: number;
  quotaWaitMs?: number;
  /** the lock between tabs (Web Locks in the browser) */
  exclusive?: <T>(fn: () => Promise<T>, wait?: boolean) => Promise<T | undefined>;
  /** headers that show the study group's link, for a sign-up */
  proof?: () => Promise<Record<string, string>>;
  /** the Magic Key on this device (see AccountDeps.magicKey) */
  magicKey?: { read(): string | null; adopt(key: string): void };
}

export async function device(w: World, opts: Options = {}) {
  const docs = new Map<string, Doc>();
  const writers = new Set<(x: { col: string; id: string; data: Doc | null }) => void>();
  const applied: string[] = [];
  const revs = new Map<string, number>();
  const bump = (k: string) => void revs.set(k, (revs.get(k) ?? 0) + 1);
  const writing = new Set<string>(); // writes begun whose hooks have not run
  const saving = new Set<Promise<void>>(); // the same, as promises, for `idle`
  /** things a test can make happen at a chosen moment inside the engine's calls */
  const hooks: { afterRead?: () => Promise<void> | void } = {};
  const store: SyncStore = {
    onWrite(fn) { writers.add(fn); return () => void writers.delete(fn); },
    revision: (col, id) => revs.get(`${col}/${id}`) ?? 0,
    writing: (col, id) => writing.has(`${col}/${id}`),
    async idle() { while (writing.size) await Promise.allSettled([...saving]); },
    async applyRemote(col, id, data, revision) {
      if (revision !== undefined && (revs.get(`${col}/${id}`) ?? 0) !== revision) return false;
      bump(`${col}/${id}`);
      applied.push(`${col}/${id}`);
      if (data === null) docs.delete(`${col}/${id}`);
      else docs.set(`${col}/${id}`, structuredClone(data));
      return true;
    },
    async documents(col) { return [...docs].filter(([k]) => k.startsWith(col + "/")).map(([k, data]) => ({ id: k.slice(col.length + 1), data: structuredClone(data) })); },
    async read(col, id) { const d = docs.get(`${col}/${id}`); const out = d ? structuredClone(d) : null; await hooks.afterRead?.(); return out; },
  };

  const me = {
    now: T0,
    offline: false,
    jar: "",
    calls: [] as string[],
    key: opts.key ?? (await passkey()),
  };

  const fetchToWorker = async (path: string, init: RequestInit = {}): Promise<Response> => {
    me.calls.push(`${init.method ?? "GET"} ${path}`);
    if (me.offline) throw new TypeError("Failed to fetch");
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (me.jar) headers.cookie = me.jar;
    if ((init.method ?? "GET") !== "GET") headers.origin = ORIGIN;
    const res = await w.app.request(ORIGIN + path, { ...init, headers }, w.env);
    const set = res.headers.get("set-cookie");
    if (set) me.jar = /Max-Age=0/i.test(set) ? "" : set.split(";")[0];
    return res;
  };

  const outbox = memoryOutbox();
  const client = createAccountClient(fetchToWorker);
  let signedOutCalls = 0;
  const sync = createSync({
    store,
    outbox,
    post: (r) => client.sync(r),
    now: () => me.now,
    setTimer: () => 0, // rounds are asked for by the test
    clearTimer: () => {},
    debounceMs: 0,
    backoffMs: opts.backoffMs,
    quotaWaitMs: opts.quotaWaitMs,
    exclusive: opts.exclusive,
    onSignedOut: () => { signedOutCalls += 1; account.signedOut(); },
  });
  const passkeys: Passkeys = {
    supported: () => true,
    create: (o) => me.key.register(o, WHERE) as Promise<Record<string, unknown>>,
    get: (o) => me.key.sign(o, WHERE) as Promise<Record<string, unknown>>,
  };
  let kept: Person | null = null;
  const account = createAccount({ client, sync, passkeys, keep: { read: () => kept, write: (p) => void (kept = p) }, proof: opts.proof, magicKey: opts.magicKey });

  return {
    ...me,
    get docs() { return docs; },
    store,
    hooks,
    outbox,
    sync,
    client,
    account,
    applied,
    get kept() { return kept; },
    set kept(p: Person | null) { kept = p; },
    get signedOutCalls() { return signedOutCalls; },
    set time(t: number) { me.now = t; },
    get time() { return me.now; },
    get offline() { return me.offline; },
    set offline(b: boolean) { me.offline = b; },
    set key(k: Passkey) { me.key = k; },
    get key() { return me.key; },
    cookie: () => me.jar,
    clearCookie: () => void (me.jar = ""),
    calls: me.calls,
    /** a document written by the page: stored here, then told to sync (as src/pwa/local-db.ts does) */
    async put(col: string, id: string, data: Doc, at?: number) {
      if (at !== undefined) me.now = at;
      docs.set(`${col}/${id}`, structuredClone(data));
      bump(`${col}/${id}`);
      for (const fn of [...writers]) fn({ col, id, data: structuredClone(data) });
      await settle();
    },
    /** a write by the page that has begun (stored in memory, revision bumped) but is still being saved: the hooks run when `finish` is called */
    begin(col: string, id: string, data: Doc | null, at?: number) {
      if (at !== undefined) me.now = at;
      const before = docs.get(`${col}/${id}`);
      if (data === null) docs.delete(`${col}/${id}`);
      else docs.set(`${col}/${id}`, structuredClone(data));
      bump(`${col}/${id}`);
      writing.add(`${col}/${id}`);
      let over!: () => void;
      saving.add(new Promise<void>((r) => (over = r)).then(() => void 0));
      const end = () => { writing.delete(`${col}/${id}`); over(); };
      const finish = async () => {
        for (const fn of [...writers]) fn({ col, id, data: data === null ? null : structuredClone(data) });
        end();
        await settle();
      };
      /** the save failed: the document goes back to what it was, and no hook is told */
      const rollback = () => {
        if (before === undefined) docs.delete(`${col}/${id}`);
        else docs.set(`${col}/${id}`, before);
        end();
      };
      return Object.assign(finish, { rollback });
    },
    async remove(col: string, id: string, at?: number) {
      if (at !== undefined) me.now = at;
      docs.delete(`${col}/${id}`);
      bump(`${col}/${id}`);
      for (const fn of [...writers]) fn({ col, id, data: null });
      await settle();
    },
    /** a document put on this device before any account (no hook yet) */
    seed(col: string, id: string, data: Doc) { docs.set(`${col}/${id}`, structuredClone(data)); },
    get(col: string, id: string): Doc | null { return docs.get(`${col}/${id}`) ?? null; },
  };
}
export type Device = Awaited<ReturnType<typeof device>>;
