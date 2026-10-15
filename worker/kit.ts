// What the tutor knows: the standing instructions, the two lookup tools and the fine points (the knowledge base's notes).
// All three are made from the full term data, which the Worker puts together from the open file (bundled with the script) and
// the course rows in its database (docs/DATA.md). The instructions, the tools and the lookups are the shared code in
// src/ai-shared, the same that the page runs; the notes are added here and never reach a browser.
import { GUIDE, finePoints, makeIndex, tutorTools } from "../src/ai-shared";
import type { DrillData } from "../src/ai-shared";
import { merge } from "../src/data/course.js";
import { readCourseRows, type CourseRows } from "./course";
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

/** The kit made from the open data and the course rows. Throws when a row is not JSON. */
export async function kitFrom(openData: object, course: Pick<CourseRows, "definitions" | "notes">): Promise<Kit> {
  const definitions = JSON.parse(course.definitions);
  const notes = JSON.parse(course.notes);
  const ix = makeIndex(merge(openData, definitions, notes) as DrillData);
  const tools = tutorTools(ix);
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    guide: GUIDE,
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as ToolDef["input_schema"] })),
    run(name, input) {
      const tool = byName.get(name);
      if (!tool) throw new Error(`unknown tool: ${name.slice(0, 60)}`);
      return tool.execute(input);
    },
    // Category ids come from the request; the shared function counts only the ids the data itself has notes for.
    finePoints: (cats) => finePoints(ix, cats),
  };
}

// Putting the data together takes a moment and the result is the same for every question, so one Worker instance does it once and
// looks again after a minute, which is how new course data reaches the tutor without a deployment.
const REFRESH_MS = 60_000;
let made: { openData: object; version: string; at: number; kit: Promise<Kit | null> } | null = null;

/** Forgets the kit made so far (the tests, which give each case a database of its own). */
export const resetKit = () => { made = null; };

/** The kit for this Worker, or null when it cannot be made (no course data in the database, data that is not JSON): the tutor is then off. */
export async function loadKit(env: Env, openData: object, now: () => number = Date.now): Promise<Kit | null> {
  if (made && made.openData === openData && now() - made.at < REFRESH_MS) return made.kit;
  const rows = await readCourseRows(env.DB);
  if (!rows) {
    made = null;
    return null;
  }
  if (made && made.openData === openData && made.version === rows.version) {
    made.at = now();
    return made.kit;
  }
  made = {
    openData,
    version: rows.version,
    at: now(),
    // Only our own messages are logged: a parse error would quote the course text.
    kit: kitFrom(openData, rows).catch((e) => {
      console.error("tutor kit not made:", e instanceof SyntaxError ? "the course data is not JSON" : e instanceof Error ? e.message : typeof e);
      return null;
    }),
  };
  return made.kit;
}
