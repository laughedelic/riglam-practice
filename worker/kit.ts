// What the tutor knows: the standing instructions, the two lookup tools and the fine points (the knowledge base's notes).
// All three are made from the full term data, which the Worker decrypts with its secret. The page's own copy of the
// instructions and tools lives in src/app/ai/tutor.js until it moves into src/ai-shared, which the Worker's kit will use then.
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

/** The kit for this Worker, or null when it cannot be made (no data key, data that does not open): the tutor is then off. */
export async function loadKit(_env: Env): Promise<Kit | null> {
  return null; // filled in together with the shared tutor code in src/ai/
}
