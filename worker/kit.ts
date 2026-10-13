// What the tutor knows: the standing instructions, the two lookup tools and the fine points (the knowledge base's notes).
// All three are made from the full term data, which the Worker puts together from the open file and the two encrypted
// course files, opened with its secret (docs/DATA.md). The instructions, the tools and the lookups are the shared code in
// src/ai-shared, the same that the page runs; the notes are added here and never reach a browser.
import { GUIDE, makeIndex, tutorTools } from "../src/ai-shared";
import type { DrillData } from "../src/ai-shared";
import { merge, open, parseKey } from "../src/data/course.js";
import type { Env } from "./env";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface Kit {
  /** the system prompt */
  guide: string;
  tools: ToolDef[];
  /** runs a tool; throws when the input is not usable (the model then sees the message as an error result) */
  run(name: string, input: unknown): unknown;
  /** the notes that belong to these category ids, one line each, without duplicates */
  finePoints(cats: string[]): string[];
}

/** The three data files as the Worker bundle holds them (worker/bundled.ts) or a test builds them. */
export interface Sources {
  /** drill-data.json, parsed */
  open: object;
  /** course-definitions.enc */
  definitions: ArrayBuffer | Uint8Array;
  /** course-notes.enc */
  notes: ArrayBuffer | Uint8Array;
}

const bytes = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b));

/** The kit made from the data files and the key. Throws when the key does not open them. */
export async function kitFrom(key: string, sources: Sources): Promise<Kit> {
  const definitions = JSON.parse(await open(key, "definitions", bytes(sources.definitions)));
  const notes = JSON.parse(await open(key, "notes", bytes(sources.notes)));
  const ix = makeIndex(merge(sources.open, definitions, notes) as DrillData);
  const tools = tutorTools(ix);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const groupNotes = ix.DATA.notes ?? {};
  return {
    guide: GUIDE,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as ToolDef["input_schema"] })),
    run(name, input) {
      const tool = byName.get(name);
      if (!tool) throw new Error(`unknown tool: ${name.slice(0, 60)}`);
      return tool.execute(input);
    },
    // Category ids come from the request: only a note the data itself has under that id counts ("__proto__" is not one).
    finePoints: (cats) => [...new Set(cats.flatMap((c) => (Object.hasOwn(groupNotes, c) && Array.isArray(groupNotes[c]) ? groupNotes[c] : [])))],
  };
}

// Opening the data takes a moment and the result is the same for every question, so one Worker instance does it once.
// A key that does not open the data is remembered as such: a new key means a new deployment, which starts a new instance.
let made: { key: string; sources: Sources; kit: Promise<Kit | null> } | null = null;

/** The kit for this Worker, or null when it cannot be made (no data key, data that does not open): the tutor is then off. */
export function loadKit(env: Env, sources: Sources): Promise<Kit | null> {
  const key = parseKey(env.RIGLAM_DATA_KEY);
  if (!key) return Promise.resolve(null);
  if (made?.key !== key || made.sources !== sources) {
    made = {
      key,
      sources,
      // Only our own messages are logged: a parse error would quote the decrypted text.
      kit: kitFrom(key, sources).catch((e) => {
        console.error("tutor kit not made:", e instanceof SyntaxError ? "the data is not JSON" : e instanceof Error ? e.message : typeof e);
        return null;
      }),
    };
  }
  return made.kit;
}
