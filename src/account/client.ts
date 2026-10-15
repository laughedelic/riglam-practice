// The app's requests for accounts and sync (docs/SERVER.md, "Accounts and sync"): one function per route, and every failure as an
// `AccountFailure` with a code the page can show. The fetch is given, so tests can point it at the Worker in the same process.
// The session is a cookie the browser keeps (HttpOnly): nothing here reads or sends it.

import {
  ACCOUNT_API,
  type AccountErrorCode,
  type Ceremony,
  type MeResponse,
  type SyncRequest,
  type SyncResponse,
} from "./protocol";
import { API } from "../ai/protocol";
import { SyncError } from "./sync";

export type FailureCode = AccountErrorCode | "offline";

/** A request that did not succeed. `message` is the server's own wording when it sent one. */
export class AccountFailure extends Error {
  constructor(public code: FailureCode, message: string = code) {
    super(message);
  }
}

const CODES: readonly string[] = ["signed_out", "not_granted", "unknown_passkey", "bad_request", "too_large", "quota", "conflict", "unavailable"];

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AccountClient {
  /** whether the server has accounts on; null when it cannot be told (offline, slow, not a Worker) */
  available(): Promise<boolean | null>;
  me(): Promise<MeResponse>;
  registerOptions(name: string, headers?: Record<string, string>): Promise<Ceremony>;
  registerVerify(challengeId: string, response: Record<string, unknown>): Promise<Extract<MeResponse, { signedIn: true }>>;
  loginOptions(): Promise<Ceremony>;
  loginVerify(challengeId: string, response: Record<string, unknown>): Promise<Extract<MeResponse, { signedIn: true }>>;
  passkeyOptions(): Promise<Ceremony>;
  passkeyVerify(challengeId: string, response: Record<string, unknown>): Promise<{ passkeys: number }>;
  logout(): Promise<void>;
  /** the signed-in account carries the Magic Key from now on; `headers` hold the access proof */
  shareKey(headers: Record<string, string>): Promise<void>;
  /** the Magic Key, from a signed-in account that carries it */
  fetchKey(): Promise<string>;
  deleteAccount(): Promise<void>;
  /** one round of sync; rejects with a SyncError */
  sync(request: SyncRequest): Promise<SyncResponse>;
}

/** `requestMs`: how long a request may take, answer included; a connection that never answers must end, or a round of sync shows "Syncing ..." for good. */
export function createAccountClient(doFetch: Fetch = (input, init) => fetch(input, init), waitMs = 4000, requestMs = 30_000): AccountClient {
  async function call<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), requestMs);
    try {
      return await send<T>(path, init, stop.signal);
    } finally {
      clearTimeout(timer);
    }
  }
  async function send<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> }, signal: AbortSignal): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal,
      });
    } catch {
      throw new AccountFailure("offline", "no connection");
    }
    if (!res.ok) {
      let code = "";
      let message = "";
      try {
        const e = ((await res.json()) as { error?: { code?: unknown; message?: unknown } })?.error;
        code = String(e?.code ?? "");
        message = typeof e?.message === "string" ? e.message : "";
      } catch { /* no JSON body: the status says enough */ }
      if (!CODES.includes(code)) code = res.status === 401 ? "signed_out" : res.status === 403 ? "not_granted" : res.status === 413 ? "too_large" : res.status === 429 ? "quota" : "unavailable";
      throw new AccountFailure(code as AccountErrorCode, message || code);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new AccountFailure(signal.aborted ? "offline" : "unavailable", signal.aborted ? "no connection" : "the answer is not JSON");
    }
  }

  const verified = async (path: string, challengeId: string, response: Record<string, unknown>) => {
    const me = await call<MeResponse>(path, { body: { challengeId, response } });
    if (!me.signedIn) throw new AccountFailure("unavailable");
    return me;
  };

  return {
    async available() {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), waitMs);
      try {
        const res = await doFetch(API.health, { cache: "no-store", signal: stop.signal });
        if (!res.ok) return null;
        const body = (await res.json()) as { ok?: boolean; accounts?: string };
        return body.ok === true ? body.accounts === "on" : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    me: () => call<MeResponse>(ACCOUNT_API.me),
    registerOptions: (name, headers) => call<Ceremony>(ACCOUNT_API.registerOptions, { body: { name }, headers }),
    registerVerify: (id, response) => verified(ACCOUNT_API.registerVerify, id, response),
    loginOptions: () => call<Ceremony>(ACCOUNT_API.loginOptions, { body: {} }),
    loginVerify: (id, response) => verified(ACCOUNT_API.loginVerify, id, response),
    passkeyOptions: () => call<Ceremony>(ACCOUNT_API.passkeyOptions, { body: {} }),
    passkeyVerify: (challengeId, response) => call<{ passkeys: number }>(ACCOUNT_API.passkeyVerify, { body: { challengeId, response } }),
    async logout() {
      await call(ACCOUNT_API.logout, { body: {} });
    },
    async shareKey(headers) {
      await call(ACCOUNT_API.key, { body: {}, headers });
    },
    async fetchKey() {
      const body = await call<{ key?: unknown }>(ACCOUNT_API.key);
      if (typeof body.key !== "string" || !body.key) throw new AccountFailure("unavailable");
      return body.key;
    },
    async deleteAccount() {
      await call(ACCOUNT_API.me, { method: "DELETE" });
    },
    async sync(request) {
      try {
        return await call<SyncResponse>(ACCOUNT_API.sync, { body: request });
      } catch (e) {
        if (!(e instanceof AccountFailure)) throw e;
        // 401 ends the account on this device; the day's limit waits; a refusal of the app's own origin or a malformed answer is a server problem to retry later
        if (e.code === "offline") throw new SyncError("offline", e.message);
        if (e.code === "signed_out") throw new SyncError("signed_out", e.message);
        if (e.code === "quota") throw new SyncError("quota", e.message);
        throw new SyncError("unavailable", e.message);
      }
    },
  };
}
