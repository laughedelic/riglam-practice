// Export and import of everything the page keeps: the documents in the `db` capability and the settings in localStorage.
//
// One JSON file holds it all, so a person can back it up, move it to another device, or bring in the history collected
// in another place (the Claude artifact). Documents are copied as they are, keyed by collection and id; no stored shape
// is changed here. The file carries a format version so that a later change of a shape can migrate old files.
//
// Import only adds and updates: it never deletes a document or a setting. A document that is already there is replaced
// only when the file's copy has a later timestamp, so importing the same file twice, or an old file into a device that
// has moved on, changes nothing it should not.

import type { Db, Doc } from "../platform/types";

export const FORMAT = "riglam-practice-data";
export const VERSION = 1;

/** The collections the page reads and writes. A file may carry others; import skips them. */
export const COLLECTIONS = ["batches", "answers", "debates", "favorites", "skips", "labruns", "flags"] as const;

/** The localStorage keys of the page's settings (notation, wording, timers ...). tests/unit/transfer.test.ts checks this list against app.js. */
export const PREFERENCE_KEYS = ["rd-notation", "rd-deflang", "rd-ab", "rd-full", "rd-wording", "rd-timer", "rd-timer-rel", "rd-blitz", "rd-lab", "rd-recent", "rd-voice-read", "rd-voice-answer", "rd-voice-name", "rd-voice-rate"] as const;

/** Largest file accepted, in bytes; a person's history is a few hundred kilobytes. */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_DOC_BYTES = 256 * 1024; // the limit of the stores (local-db.ts, the artifact runtime)
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
/** `__proto__` passes the pattern, but the page builds objects keyed by document id, and assigning that key changes the object's prototype. */
const validId = (id: string): boolean => ID.test(id) && id !== "." && id !== ".." && id !== "__proto__";

export interface DataFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  /** collection -> document id -> document */
  collections: Record<string, Record<string, Doc>>;
  /** localStorage key -> value */
  preferences: Record<string, string>;
}

/** A refusal with a message fit for the person to read. */
export class TransferError extends Error {}

const isPlain = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** The text of `value` with object keys in order, so that two copies of a document compare equal whatever store they came from. */
function canon(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
  if (isPlain(value)) return "{" + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(value[k])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

/** When a document was last changed, in milliseconds; undefined when it carries no timestamp. */
export function stampOf(doc: Doc): number | undefined {
  let best: number | undefined;
  for (const k of ["at", "verifiedAt", "updatedAt"]) {
    const t = typeof doc[k] === "string" ? Date.parse(doc[k]) : NaN;
    if (!Number.isNaN(t) && (best === undefined || t > best)) best = t;
  }
  return best;
}

function storageOf(given?: Storage | null): Storage | null {
  if (given !== undefined) return given;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Reads every known collection and the settings into a file object. */
export async function exportData(db: Db, opts: { storage?: Storage | null; now?: Date } = {}): Promise<DataFile> {
  const collections: DataFile["collections"] = {};
  for (const name of COLLECTIONS) {
    const docs: Record<string, Doc> = {};
    try {
      const snap = await db.collection(name).get();
      for (const d of snap.docs) if (validId(d.id)) docs[d.id] = d.data() ?? {};
    } catch (e) {
      throw new TransferError(`The ${name} could not be read (${(e as { code?: string })?.code ?? "error"}).`);
    }
    collections[name] = docs;
  }
  const preferences: Record<string, string> = {};
  const storage = storageOf(opts.storage);
  for (const key of PREFERENCE_KEYS) {
    try {
      const v = storage?.getItem(key);
      if (typeof v === "string") preferences[key] = v;
    } catch { /* storage blocked: the settings are left out */ }
  }
  return { format: FORMAT, version: VERSION, exportedAt: (opts.now ?? new Date()).toISOString(), collections, preferences };
}

export const serialize = (file: DataFile): string => JSON.stringify(file, null, 1);

/** The name a downloaded file gets: riglam-practice-2026-10-13.json. */
export const fileName = (now: Date = new Date()): string => `riglam-practice-${now.toISOString().slice(0, 10)}.json`;

/** Checks the text of a file and returns its content; throws a TransferError saying what is wrong. */
export function parseDataFile(text: string): DataFile {
  if (text.length > MAX_FILE_BYTES) throw new TransferError("That file is too large to be a data file from this app.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new TransferError("That is not a data file from this app: it is not valid JSON."); }
  if (!isPlain(raw) || raw.format !== FORMAT) throw new TransferError("That is not a data file from this app.");
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new TransferError("That data file has no valid version number.");
  if (raw.version > VERSION) throw new TransferError("That file was made by a newer version of the app. Update the app and try again.");
  if (!isPlain(raw.collections)) throw new TransferError("That data file holds no collections.");
  const preferences: Record<string, string> = {};
  if (isPlain(raw.preferences)) for (const [k, v] of Object.entries(raw.preferences)) if (typeof v === "string") preferences[k] = v;
  return {
    format: FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    collections: raw.collections as DataFile["collections"],
    preferences,
  };
}

export interface Counts {
  /** not on this device yet */
  add: number;
  /** on this device, older than the file's copy */
  update: number;
  /** identical on this device */
  same: number;
  /** on this device and at least as new (or the file's copy has no timestamp) */
  keep: number;
}
const zero = (): Counts => ({ add: 0, update: 0, same: 0, keep: 0 });

export interface Write { collection: string; id: string; doc: Doc }

/** What import does with the file's copy of a document, given the copy on this device (undefined when there is none). */
function decide(mine: Doc | undefined, theirs: Doc): keyof Counts {
  if (!mine) return "add";
  if (canon(mine) === canon(theirs)) return "same";
  const t = stampOf(theirs), o = stampOf(mine);
  return t !== undefined && (o === undefined || t > o) ? "update" : "keep";
}

export interface ImportPlan {
  /** per known collection, what import would do */
  counts: Record<string, Counts>;
  totals: Counts;
  writes: Write[];
  /** documents in the file that are not valid (bad id, not an object, too large) and are left out */
  invalid: number;
  /** collections in the file that this app does not use, and are left out */
  ignored: string[];
  /** settings from the file that this device has not set yet */
  preferences: Record<string, string>;
  /** the file's export time, for the person to recognise the file */
  exportedAt: string;
}

/** Compares the file with what is on this device and lists what import would write. Writes nothing. */
export async function planImport(db: Db, file: DataFile, opts: { storage?: Storage | null } = {}): Promise<ImportPlan> {
  const counts: Record<string, Counts> = {};
  const totals = zero();
  const writes: Write[] = [];
  let invalid = 0;
  for (const name of COLLECTIONS) {
    const incoming = file.collections[name];
    const c = (counts[name] = zero());
    if (incoming === undefined) continue;
    if (!isPlain(incoming)) { invalid += 1; continue; }
    const have = new Map<string, Doc>();
    try {
      for (const d of (await db.collection(name).get()).docs) have.set(d.id, d.data() ?? {});
    } catch (e) {
      throw new TransferError(`The ${name} on this device could not be read (${(e as { code?: string })?.code ?? "error"}).`);
    }
    for (const [id, doc] of Object.entries(incoming)) {
      if (!validId(id) || !isPlain(doc) || JSON.stringify(doc).length > MAX_DOC_BYTES) { invalid += 1; continue; }
      const verdict = decide(have.get(id), doc);
      c[verdict] += 1;
      if (verdict === "add" || verdict === "update") writes.push({ collection: name, id, doc });
    }
    for (const k of Object.keys(totals) as (keyof Counts)[]) totals[k] += c[k];
  }
  const ignored = Object.keys(file.collections).filter((n) => !(COLLECTIONS as readonly string[]).includes(n));
  const preferences: Record<string, string> = {};
  const storage = storageOf(opts.storage);
  for (const key of PREFERENCE_KEYS) {
    const v = file.preferences[key];
    if (typeof v !== "string") continue;
    try { if (storage && storage.getItem(key) === null) preferences[key] = v; } catch { /* blocked */ }
  }
  return { counts, totals, writes, invalid, ignored, preferences, exportedAt: file.exportedAt };
}

export interface ImportReport {
  written: number;
  /** documents that changed on this device after the preview, so that the file's copy was no longer the one to write */
  skipped: number;
  /** documents that could not be written, as "collection/id (code)" */
  failed: string[];
  preferencesRestored: number;
}

/**
 * Writes the planned documents and restores the planned settings. A document that fails is reported and the rest go on.
 * The preview can be minutes old (a check-lab verdict or another tab may have saved a newer copy since), so each document is
 * compared again just before it is written, with the same rule as the plan.
 */
export async function applyImport(db: Db, plan: ImportPlan, opts: { storage?: Storage | null } = {}): Promise<ImportReport> {
  const failed: string[] = [];
  let written = 0;
  let skipped = 0;
  const CHUNK = 10;
  for (let i = 0; i < plan.writes.length; i += CHUNK) {
    await Promise.all(
      plan.writes.slice(i, i + CHUNK).map(async (w) => {
        try {
          const ref = db.collection(w.collection).doc(w.id);
          const now = await ref.get();
          const verdict = decide(now.exists ? now.data() ?? {} : undefined, w.doc);
          if (verdict !== "add" && verdict !== "update") { skipped += 1; return; }
          await ref.set(w.doc);
          written += 1;
        } catch (e) {
          failed.push(`${w.collection}/${w.id} (${(e as { code?: string })?.code ?? "error"})`);
        }
      }),
    );
  }
  let preferencesRestored = 0;
  const storage = storageOf(opts.storage);
  for (const [key, value] of Object.entries(plan.preferences)) {
    try {
      if (storage && storage.getItem(key) === null) { storage.setItem(key, value); preferencesRestored += 1; }
    } catch { /* blocked */ }
  }
  return { written, skipped, failed, preferencesRestored };
}
