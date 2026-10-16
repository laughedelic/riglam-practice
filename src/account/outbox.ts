// What this device has changed and the server has not heard of yet, and the few facts sync keeps between visits.
// One entry per document: a later change of the same document replaces the earlier one.

import type { Doc } from "./protocol";

export interface OutboxEntry {
  /** "collection/id" */
  key: string;
  c: string;
  id: string;
  /** the document as it is now, or null when it was deleted */
  doc: Doc | null;
  /** when the change was made, ms since the epoch */
  t: number;
}

export interface Outbox {
  put(entry: OutboxEntry): Promise<void>;
  /** stores the entry as the document's change, with its time raised to just above that of the entry it replaces, in one step (two tabs noting the same document cannot be given the same time) */
  note(entry: OutboxEntry): Promise<void>;
  /** adds the entry unless there already is one for the document */
  putIfAbsent(entry: OutboxEntry): Promise<void>;
  get(key: string): Promise<OutboxEntry | undefined>;
  /** up to `limit` entries, oldest change first; with `"deletions"`, only the entries that delete a document */
  list(limit: number, only?: "deletions"): Promise<OutboxEntry[]>;
  /** removes the entry for `key`, but only if it is still the one with change time `t` (it may have been replaced meanwhile) */
  remove(key: string, t: number): Promise<void>;
  count(): Promise<number>;
  /** the entries and the facts */
  clear(): Promise<void>;
  getMeta<T = unknown>(name: string): Promise<T | undefined>;
  setMeta(name: string, value: unknown): Promise<void>;
}

export function memoryOutbox(): Outbox {
  const entries = new Map<string, OutboxEntry>();
  const meta = new Map<string, unknown>();
  return {
    async put(e) { entries.set(e.key, { ...e }); },
    async note(e) { const before = entries.get(e.key); entries.set(e.key, { ...e, t: before && before.t >= e.t ? before.t + 1 : e.t }); },
    async putIfAbsent(e) { if (!entries.has(e.key)) entries.set(e.key, { ...e }); },
    async get(key) { const e = entries.get(key); return e && { ...e }; },
    async list(limit, only) { return [...entries.values()].filter((e) => only !== "deletions" || e.doc === null).sort((a, b) => a.t - b.t).slice(0, limit).map((e) => ({ ...e })); },
    async remove(key, t) { if (entries.get(key)?.t === t) entries.delete(key); },
    async count() { return entries.size; },
    async clear() { entries.clear(); meta.clear(); },
    async getMeta<T>(name: string) { return meta.get(name) as T | undefined; },
    async setMeta(name, value) { meta.set(name, value); },
  };
}
