// Stand-ins for what the Worker runs on: D1 (SQLite from Node, so the real SQL runs), the Anthropic API (a fetch that answers
// with scripted server-sent events, so the real SDK client parses them), and a kit with two tools.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { testMagicKey } from "../support/magic-key";
import { resetKit } from "../../worker/kit";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { HEADER } from "../../src/ai/protocol";
import type { Env } from "../../worker/env";
import type { Kit } from "../../worker/kit";

/* ---------- D1 ---------- */

type Value = string | number | null;
class Statement {
  constructor(private db: DatabaseSync, readonly sql: string, private values: Value[] = []) {}
  bind(...values: Value[]) { return new Statement(this.db, this.sql, values); }
  runNow() {
    const r = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] };
  }
  run() { return Promise.resolve(this.runNow()); }
  first<T>() { return Promise.resolve((this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null); }
  all<T>() { return Promise.resolve({ success: true, results: this.db.prepare(this.sql).all(...this.values) as T[] }); }
}

/** A D1 database over an in-memory SQLite with the Worker's migrations applied. `sql` is for the tests to look inside. */
export function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../../worker/migrations/", import.meta.url);
  for (const f of readdirSync(dir).sort()) sqlite.exec(readFileSync(new URL(f, dir), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    // D1 runs a batch as one transaction; here it runs without a pause, so that two batches cannot interleave
    batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const out = statements.map((s) => s.runNow());
        sqlite.exec("COMMIT");
        return Promise.resolve(out);
      } catch (e) {
        sqlite.exec("ROLLBACK");
        return Promise.reject(e);
      }
    },
  };
  return { d1: d1 as unknown as D1Database, sql: <T = Record<string, unknown>>(query: string, ...p: Value[]) => sqlite.prepare(query).all(...p) as T[] };
}

/** Puts the course rows into the database, as `npm run data:publish` does. */
export async function seedCourse(d1: D1Database, rows: { definitions: string; notes: string }, at = "2026-10-13T09:00:00.000Z") {
  for (const [kind, body] of [["definitions", rows.definitions], ["notes", rows.notes]]) {
    await d1.prepare("INSERT OR REPLACE INTO course_data (kind, body, updated_at) VALUES (?1, ?2, ?3)").bind(kind, body, at).run();
  }
}

/* ---------- Anthropic ---------- */

export interface Round {
  /** the text, in the pieces it is streamed in */
  text?: string[];
  tool?: { id: string; name: string; input: unknown };
  stop?: "end_turn" | "tool_use" | "max_tokens" | "refusal";
  /** the model the API says answered (default claude-sonnet-5-5) */
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  /** answer with an HTTP error instead */
  error?: { status: number; type: string };
  /** stream the text, then wait for the caller to hang up */
  hang?: boolean;
  /** stream the text, then break the connection (before the closing usage event) */
  cut?: boolean;
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function body(r: Round, n: number, signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> {
  const u = r.usage ?? {};
  const enc = new TextEncoder();
  const parts: string[] = [
    sse("message_start", { type: "message_start", message: { id: `msg_${n}`, type: "message", role: "assistant", content: [], model: r.model ?? "claude-sonnet-5-5", stop_reason: null, stop_sequence: null, usage: { input_tokens: u.input ?? 100, output_tokens: 1, cache_read_input_tokens: u.cacheRead ?? 0, cache_creation_input_tokens: u.cacheWrite ?? 0 } } }),
  ];
  let index = 0;
  if (r.text?.length) {
    parts.push(sse("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
    for (const t of r.text) parts.push(sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: t } }));
    parts.push(sse("content_block_stop", { type: "content_block_stop", index }));
    index += 1;
  }
  if (r.tool) {
    parts.push(sse("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: r.tool.id, name: r.tool.name, input: {} } }));
    parts.push(sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(r.tool.input) } }));
    parts.push(sse("content_block_stop", { type: "content_block_stop", index }));
  }
  const stop = r.stop ?? (r.tool ? "tool_use" : "end_turn");
  const tail = [sse("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: u.output ?? 20 } }), sse("message_stop", { type: "message_stop" })];
  return new ReadableStream({
    async start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      if (r.cut) {
        await new Promise((resolve) => setTimeout(resolve, 20)); // an error discards what is queued: let the reader take the text first
        c.error(new TypeError("terminated"));
        return;
      }
      if (r.hang) {
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
        c.error(new DOMException("aborted", "AbortError"));
        return;
      }
      for (const p of tail) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

/** A fetch that plays `rounds` in order, one per model call, and keeps what it was asked. */
export function fakeAnthropic(rounds: Round[]) {
  const calls: { url: string; body: any }[] = [];
  const fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const json = JSON.parse(await req.clone().text());
    calls.push({ url: req.url, body: json });
    const r = rounds[Math.min(calls.length - 1, rounds.length - 1)];
    if (r.error) return new Response(JSON.stringify({ type: "error", error: { type: r.error.type, message: "scripted" } }), { status: r.error.status, headers: { "content-type": "application/json" } });
    return new Response(body(r, calls.length, init?.signal ?? req.signal), { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/* ---------- the kit ---------- */

export function fakeKit(over: Partial<Kit> = {}) {
  const ran: { name: string; input: unknown }[] = [];
  const kit: Kit = {
    guide: "GUIDE: you are a terse tutor.",
    tools: [{ name: "lookup_term", description: "Look up a term.", input_schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } }],
    run(name, input) {
      ran.push({ name, input });
      if (name === "boom") throw new Error("no such term");
      return { found: true, name: (input as { name?: string })?.name };
    },
    finePoints: (cats) => cats.filter((c) => c === "c_form").map(() => "A person is not form; the body is."),
    ...over,
  };
  return { kit, ran };
}

/* ---------- a whole setup ---------- */

export const NOW = new Date("2026-10-13T10:00:00Z");

export async function setup(over: Partial<Env> = {}) {
  resetKit(); // each case has a database of its own, so the kit made for the last one is not the kit for this one
  const key = over.RIGLAM_DATA_KEY ?? testMagicKey();
  const device = newDeviceId();
  const proof = await makeProof(key, device);
  const db = fakeD1();
  const env = { DB: db.d1, ANTHROPIC_API_KEY: "test-key", RIGLAM_DATA_KEY: key, ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher, ...over } as Env;
  const headers = (extra: Record<string, string> = {}) => ({ "content-type": "application/json", [HEADER.device]: device, [HEADER.proof]: proof, ...extra });
  return { key, device, proof, db, env, headers };
}

/** The events of a server-sent response, in order. */
export async function events(res: Response): Promise<{ type: string; [k: string]: unknown }[]> {
  const text = await res.text();
  return text.split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.split("\n").find((l) => l.startsWith("data:"))!.slice(5)));
}

export const ask = (over: Record<string, unknown> = {}) => JSON.stringify({ kind: "explain", cats: ["c_form", "c_round"], turns: [{ role: "user", content: "CARD: A is form, B is round." }], ...over });

/** The JSON of a response, untyped. */
export const json = async (res: Response): Promise<any> => res.json();
