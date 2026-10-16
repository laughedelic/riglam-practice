// The seam between the page and the place it runs in. The page (src/app) is started with a `Platform` and asks it
// for everything it cannot do itself: its term data, the two capabilities of the Claude artifact runtime, `db`
// (a document store) and `sample` (one model call), `tutor`, a question to the app's own server, and `reports`, flags sent to it. Each build supplies its own adapter (src/pwa/platform.ts,
// src/artifact/platform.ts); the tests supply a mock. A capability the place cannot provide is `null` and the page
// hides the features that need it.

/** The term data as the page reads it (docs/DATA.md); the types live with the code that reads it. */
import type { DrillData } from "../ai-shared/data";
import type { TutorRequest } from "../ai/protocol";
import type { Account, AccountView } from "../account/account";
import type { FlagReport, ReportStatus } from "../report/protocol";
export type { DrillData, Account, AccountView, FlagReport };

/** A stored document: a plain JSON object. */
export type Doc = Record<string, any>;

export interface SnapshotMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): Doc | undefined;
  metadata: SnapshotMetadata;
}

export interface DocChange {
  type: "added" | "modified" | "removed";
  doc: DocSnapshot;
  oldIndex: number;
  newIndex: number;
}

export interface QuerySnapshot {
  docs: DocSnapshot[];
  size: number;
  empty: boolean;
  metadata: SnapshotMetadata;
  docChanges(): DocChange[];
}

export type Unsubscribe = () => void;

export interface Query {
  where(field: string, op: string, value: unknown): Query;
  orderBy(field: string, dir?: "asc" | "desc"): Query;
  limit(n: number): Query;
  get(): Promise<QuerySnapshot>;
  onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: unknown) => void): Unsubscribe;
}

/** The result of `DocRef.acquire`: a lease on the document, or the time the current holder's lease ends. */
export type Lease =
  | { acquired: true; version: number; expiresAt: string; holder: string }
  | { acquired: false; expiresAt: string };

export interface DocRef {
  id: string;
  path: string;
  get(): Promise<DocSnapshot>;
  set(data: Doc): Promise<void>;
  update(data: Doc): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: unknown) => void): Unsubscribe;
  /** Takes a lease on the document for `ttlMs` (1 s to 10 min, 30 s by default) so that one holder at a time works on it. The page does not use it. */
  acquire(options: { holder: string; ttlMs?: number }): Promise<Lease>;
  /** A collection under this document (`collection/id/sub`). The page does not use it. */
  collection(sub: string): CollectionRef;
}

export interface CollectionRef extends Query {
  path: string;
  doc(id?: string): DocRef;
  add(data: Doc): Promise<DocRef>;
}

/** The `db` capability: Firestore-style documents at `collection/id` (the artifact runtime's db.d.ts). */
export interface Db {
  collection(path: string): CollectionRef;
  doc(path: string): DocRef;
}

export interface SampleOptions {
  model?: string;
  modelTier?: string;
  effort?: string;
  cache?: boolean;
  signal?: AbortSignal;
  tools?: unknown;
  onText?: (partial: { text: string }) => void;
}

export interface SampleResult {
  text: string;
  truncated?: boolean;
  modelApplied?: string;
  modelTierApplied?: string;
}

/** The `sample` capability: one model call, from a prompt or a list of turns (the artifact runtime's sample.d.ts). */
export type Sample = (input: string | { role: string; content: string }[], options?: SampleOptions) => Promise<SampleResult>;

export interface TutorOptions {
  signal?: AbortSignal;
  /** called with all the text so far each time more of the answer arrives */
  onText?: (partial: { text: string }) => void;
}

/**
 * The `tutor` capability: one question to the app's server (docs/SERVER.md), which holds the instructions, the lookup
 * tools and the notes. The request is the conversation and the pair's categories (src/ai/protocol.ts). Rejects with an
 * error that has a `code`: the server's (`rate_limited`, `not_granted`, `prompt_too_large`, `bad_request`, `refused`,
 * `unavailable`), `offline`, or `cancelled` when `signal` aborted. A rejection after some text arrived carries it as `text`.
 */
export type Tutor = (request: TutorRequest, options?: TutorOptions) => Promise<SampleResult>;

/**
 * The `reports` capability: a learner's flag goes to the app's server with the stored answer it was made on
 * (src/report/protocol.ts). The place has it only when its server takes reports and this device has the Magic Key.
 * No method rejects. `send` resolves with the ids the server now holds (fewer than asked when it could not be reached or
 * refused). `withdraw` keeps the id on the device until the server has taken the report back; `flush` tries again.
 * `status` asks where the review of these flags stands and what the reply is; it resolves with what the server told
 * (nothing when it could not be reached or refused).
 */
export interface Reports {
  send(reports: FlagReport[]): Promise<string[]>;
  status(ids: string[]): Promise<ReportStatus[]>;
  withdraw(id: string): Promise<void>;
  flush(): Promise<void>;
}

/**
 * `open` shows the prompt for the Magic Key; `tutor` says that the place has a tutor that is waiting for it (so the page shows Explain grayed).
 * When the server needs time to say so, `tutor` starts false and `answer` settles with the real value: the page does not wait for it,
 * sets `tutor` when it arrives and draws again.
 */
export interface Unlock {
  open(): void;
  tutor: boolean;
  answer?: Promise<boolean>;
}

export interface Platform {
  /** Which build runs the page. Informational; the page must not branch on it. */
  readonly target: "pwa" | "artifact" | "test";
  /** The term data. Rejects when the data cannot be loaded; the page then shows its "no data" screen. */
  loadData(): Promise<DrillData>;
  /** The document store, or null when there is none (the page then runs without saving). */
  db(): Promise<Db | null>;
  /** Model calls, or null when there are none (the page then hides the tutor, Explain and the check lab). */
  sample(): Promise<Sample | null>;
  /** The way to enter the Magic Key (the study group's key: it opens the definitions and the tutor), or null (or absent) when the place has no key to ask for or this device has it. */
  unlock?(): Promise<Unlock | null>;
  /** The app's own tutor, or null (or absent) when the place has none or the server has it switched off. The page uses `sample` first when it has one. */
  tutor?(): Promise<Tutor | null>;
  /** Sending flags to the app's server, or null (or absent) when the place has no server for them or this device lacks the Magic Key (flags then stay on the device). */
  reports?(): Promise<Reports | null>;
  /** The optional account (a passkey and a server copy of the documents, src/account), or null (or absent) when the place has none. The page works the same without. */
  account?(): Promise<Account | null>;
}
