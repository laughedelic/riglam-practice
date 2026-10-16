// The contract between the app and its server for accounts and sync (docs/SERVER.md, "Accounts and sync"). Both sides
// import this file, so the shapes and the limits cannot drift apart.
//
// An account is optional. It holds a server copy of the person's documents (the same collections the page keeps on the
// device) and a passkey to sign in with; nothing else about the person.

export const ACCOUNT_API = {
  /** GET: who is signed in. DELETE: delete the account with everything in it. */
  me: "/api/account",
  registerOptions: "/api/account/register/options",
  registerVerify: "/api/account/register/verify",
  loginOptions: "/api/account/login/options",
  loginVerify: "/api/account/login/verify",
  /** add another passkey to the signed-in account */
  passkeyOptions: "/api/account/passkeys/options",
  passkeyVerify: "/api/account/passkeys/verify",
  logout: "/api/account/logout",
  /** POST with the access proof: this account carries the Magic Key from now on. GET: the Magic Key, to a signed-in account that carries it. */
  key: "/api/account/key",
  sync: "/api/sync",
} as const;

/** The collections the page keeps (and the server accepts); the same list as src/store/transfer.ts. */
export const SYNC_COLLECTIONS = ["batches", "answers", "debates", "favorites", "skips", "labruns", "flags"] as const;

/** A document id as the stores accept it. `__proto__` passes the pattern but the page builds objects keyed by id, so it is refused. */
export const DOC_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
export const validDocId = (id: unknown): id is string => typeof id === "string" && DOC_ID.test(id) && id !== "." && id !== ".." && id !== "__proto__";

export const SYNC_LIMITS = {
  /** writes in one request */
  writes: 200,
  /** one document, as JSON text (the limit of the stores) */
  docBytes: 256 * 1024,
  /** the request body */
  body: 4 * 1024 * 1024,
  /** changes in one answer; `more` says there are further ones */
  changes: 500,
  /** the longest name a person can give an account */
  name: 40,
} as const;

export type AccountErrorCode =
  | "signed_out" // no session, or it has ended
  | "not_granted" // sign-up needs the Magic Key's proof (or is closed), the account does not carry the key, or the request is from another origin
  | "unknown_passkey" // the passkey is not one this server has
  | "bad_request"
  | "too_large"
  | "quota" // the account's limit for the day, or the server's number of accounts
  | "full" // the account holds as many documents (or deletion marks) as it may; this does not end at midnight
  | "conflict" // that passkey is already registered
  | "unavailable"; // accounts are off or not set up

export interface AccountError {
  error: { code: AccountErrorCode; message: string };
}

export interface AccountInfo {
  id: string;
  /** what the person called the account; shown by the passkey manager */
  name: string;
  passkeys: number;
  createdAt: string;
  /** the account carries the Magic Key: a device that signs in to it can get the key */
  hasKey: boolean;
}

export type MeResponse = { signedIn: false } | { signedIn: true; user: AccountInfo };

/** A passkey ceremony starts with the options for `navigator.credentials` and an id for the challenge behind them. `options` is the JSON form WebAuthn defines. */
export interface Ceremony {
  challengeId: string;
  options: Record<string, unknown>;
}

export interface RegisterOptionsRequest {
  name?: string;
}

/** The finishing request of every ceremony: the challenge it answers and what the browser made (WebAuthn's JSON form). */
export interface VerifyRequest {
  challengeId: string;
  response: Record<string, unknown>;
}

export type Doc = Record<string, unknown>;

/**
 * One change to one document. `doc` is null for a deletion. `t` is when the change was made on the device, in
 * milliseconds since the epoch; the later `t` wins, and a tie keeps what the server has.
 */
export interface SyncChange {
  c: string;
  id: string;
  doc: Doc | null;
  t: number;
}

export interface SyncRequest {
  /** the last `cursor` this device was given; 0 on the first request */
  cursor: number;
  writes: SyncChange[];
}

export interface SyncResponse {
  /** pass it back next time */
  cursor: number;
  /** the documents that changed on the server since `cursor`, in the order they arrived (including this request's own accepted writes) */
  changes: SyncChange[];
  /** writes of this request that lost against a newer copy on the server, with that copy; the device takes it */
  rejected: SyncChange[];
  /** there are further changes: ask again with the new cursor */
  more: boolean;
}
