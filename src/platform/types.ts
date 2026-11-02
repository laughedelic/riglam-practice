// The seam between the page and the place it runs in. The page (src/app) is started with a `Platform` and asks it
// for everything it cannot do itself: its term data, the two capabilities of the Claude artifact runtime, `db`
// (a document store) and `sample` (one model call), `tutor`, a question to the app's own server, and `reports`, flags sent to it. Each build supplies its own adapter (src/pwa/platform.ts,
// src/artifact/platform.ts); the tests supply a mock. A capability the place cannot provide is `null` and the page
// hides the features that need it.

/** The term data as the page reads it (docs/DATA.md); the types live with the code that reads it. */
import type { DrillData } from "../ai-shared/data";
import type { Examples } from "../ai-shared/examples";
import type { KnownFact, KnownRequest, QuorumOffer, QuorumRecord, TutorRequest } from "../ai/protocol";
import type { Account, AccountView } from "../account/account";
import type { FlagReport, ReportStatus } from "../report/protocol";
export type { DrillData, Examples, Account, AccountView, FlagReport };

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
  /** Quorum only: called as each model (and then the judge) has answered or failed */
  onStep?: (step: { name: string; ok: boolean }) => void;
}

/** The answer of the tutor: the text, and for a question Quorum answered, its record; `single` says that Quorum was asked for but the one model answered (its budget is used). */
export interface TutorResult extends SampleResult {
  quorum?: QuorumRecord;
  single?: "budget";
}

/**
 * The `tutor` capability: one question to the app's server (docs/SERVER.md), which holds the instructions, the lookup
 * tools and the notes. The request is the conversation and the pair's categories (src/ai/protocol.ts). Rejects with an
 * error that has a `code`: the server's (`rate_limited`, `not_granted`, `prompt_too_large`, `bad_request`, `refused`,
 * `unavailable`), `offline`, or `cancelled` when `signal` aborted. A rejection after some text arrived carries it as `text`.
 */
export type Tutor = (request: TutorRequest, options?: TutorOptions) => Promise<TutorResult>;

/**
 * The `known` capability: what the app's server already knows of examples the page could not check (POST /api/known), each as the tutor's line for
 * its cell. It resolves to an empty list when the server knows nothing, cannot be reached or refuses; it never throws.
 */
export type Known = (request: KnownRequest, options?: { signal?: AbortSignal }) => Promise<KnownFact[]>;

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
 * While this device has no Magic Key: `enter` takes one typed or pasted in Settings' Magic Key page, which the page opens wherever the key is
 * needed (the roadmap's Magic Key, Explain, a flag). `tutor` says that the place has a tutor that is waiting for it (so the page shows Explain
 * grayed). When the server needs time to say so, `tutor` starts false and `answer` settles with the real value: the page does not wait for it,
 * sets `tutor` when it arrives and draws again.
 */
export interface Unlock {
  /** Takes the key typed or pasted (the words, or the whole link): resolves with null when it was taken (the page has been told through `onKey`, or is reloading), or with the sentence to show. */
  enter(text: string): Promise<string | null>;
  /** What went wrong with a key at the start (a link whose key does not fit, a key the study group changed): the page opens the Magic Key page with it. Given once. */
  problem?: string | null;
  tutor: boolean;
  answer?: Promise<boolean>;
}

/** Which build runs, for Options (platform.about). */
export interface About {
  version: string;
  /** the commit the build was made from, short; ends in "+local" for a build with uncommitted changes */
  commit: string;
  builtAt: string;
  /** whether the server has a newer build than this one; "unknown" while offline or when the server does not say */
  latest: "current" | "newer" | "unknown";
  /** the pull request branches a staging build was made from, when the server says */
  branches?: string[];
}

/** Where the check for a newer version stands (platform.updates). */
export type UpdateStatus =
  | "current" // nothing newer was found at the last check
  | "checking"
  | "downloading" // a newer version was found and is being fetched in the background
  | "ready" // a newer version is on the device and starts when the app is reloaded
  | "unknown"; // the last check failed (no connection, or the server did not answer)

/** Updating the installed app in place (src/pwa/updates.ts). The page shows the status in Options; the place shows its own prompt when a version is ready. */
/** A pull request a staging build was made from: its number, its title and the learner-facing line its body prepared (null: none). */
export interface StagingPull { number: number; title?: string; news?: string | null }

export interface Updates {
  status(): UpdateStatus;
  /** Asks the server for a newer version now. A check younger than `maxAgeMs` is not repeated. Never rejects. */
  check(maxAgeMs?: number): Promise<void>;
  /** Starts the version that is ready: the app reloads. Does nothing unless the status is "ready". */
  apply(): void;
  /** The notice's sentence for a version that is ready: which one, and what updating does ("New version ready (0.17.0). Updating reloads the app; your answers stay."). */
  readyText?(): string;
  /** The version on its way, once it is known: its version, its commit, the newest items of its What's new, and on staging the pull requests it was built from (the pinned line of a Preview names them). */
  coming?(): { version: string | null; commit: string; pulls?: StagingPull[]; news?: { id: string; title: string; text: string }[] } | null;
  /** On staging: the pull requests the running build was made from (read once at the start), else null. */
  ownPulls?(): StagingPull[] | null;
  /** Calls `fn` whenever the status changes; returns the way to stop. */
  subscribe(fn: () => void): () => void;
}

export interface Platform {
  /** Which build runs the page. Informational; the page must not branch on it. */
  readonly target: "pwa" | "artifact" | "test";
  /**
   * Whether this is a Preview (staging, a pull request build) and not the real app. Features still on trial are on by default in a Preview
   * and off in the real app; the page only reads it for that default. Absent: not a Preview.
   */
  readonly preview?: boolean;
  /** The term data. Rejects when the data cannot be loaded; the page then shows its "no data" screen. */
  loadData(): Promise<DrillData>;
  /** The document store, or null when there is none (the page then runs without saving). */
  db(): Promise<Db | null>;
  /** Model calls, or null when there are none (the page then hides the tutor and Explain). */
  sample(): Promise<Sample | null>;
  /** The way to enter the Magic Key (the study group's key: it opens the definitions and the tutor), or null (or absent) when the place has no key to ask for or this device has it. */
  unlock?(): Promise<Unlock | null>;
  /** The other half of `unlock`: set while this device has the Magic Key, null (or absent) otherwise. */
  keyHeld?(): Promise<KeyHeld | null>;
  /**
   * Calls `tell` after a Magic Key typed on the Magic Key page was taken into the running page, instead of reloading it: the page then asks
   * `loadData`, `unlock`, `keyHeld` and `tutor` again and draws what it has, so the pair on the screen stays. `tell` may be async;
   * `enter` waits for it. Returns the way to stop. A place that does not offer it makes `enter` reload the page.
   */
  onKey?(tell: () => void | Promise<void>): () => void;
  /** The app's own tutor, or null (or absent) when the place has none or the server has it switched off. The page uses `sample` first when it has one. */
  tutor?(): Promise<Tutor | null>;
  /** The learned facts of the app's server, or null (or absent) when the place has none, this device has no Magic Key, or the server does not answer from them. */
  known?(): Promise<Known | null>;
  /** Whether the app's server keeps what the tutor's answers say of the learner's examples (docs/SERVER.md, "Learned facts"); false (or absent) when the place has no such server or this device has no Magic Key. The page then tells the learner and offers the switch in the Practice options. */
  shares?(): Promise<boolean>;
  /** Sending flags to the app's server, or null (or absent) when the place has no server for them or this device lacks the Magic Key (flags then stay on the device). */
  reports?(): Promise<Reports | null>;
  /** Keeps the id of a flag removed while `reports` gave null (offline at the start, no key), so that a later start that has it takes the report back from the server. */
  withdrawReport?(id: string): void;
  /** What the app's server offers this device of Quorum, the tutor's mode of several models and a judge (docs/SERVER.md): "on" (a Preview: on until the device turns it off), "optin" (off until the device turns it on), or false. Absent: the page has no Quorum. */
  quorum?(): Promise<QuorumOffer>;
  /**
   * The course's reference examples (the device part, docs/DATA.md), or null (or absent) when this device has none: no key, the
   * server has none, or they have not arrived yet. They come in the background, after the page started; a later call may have them.
   */
  examples?(): Promise<Examples | null>;
  /** Calls `tell` whenever a newer copy of the examples was kept on the device (they are fetched in the background), so that the page reads `examples` again. Returns the way to stop. */
  onExamples?(tell: () => void): () => void;
  /** The optional account (a passkey and a server copy of the documents, src/account), or null (or absent) when the place has none. The page works the same without. */
  account?(): Promise<Account | null>;
  /** Which build this is and whether a newer one is out, or null (or absent) when the place has no builds to tell apart (the artifact). */
  about?(): Promise<About | null>;
  /** Updating in place, or absent when the place has no installed copy to update (the artifact, the tests). */
  updates?: Updates;
}

/** What a device that has the Magic Key can do with it: take another one (the study group changed it), or forget it (the definitions and the tutor lock again). */
export interface KeyHeld {
  /** As `Unlock.enter`: another key, kept in place of this one once the server takes it. */
  enter(text: string): Promise<string | null>;
  forget(): void;
}
