// The case set as it stands: the stored answers, the hand-written hard ones and the labels in data-private/eval/, and the answers made from the practice list, built into cases.
import { existsSync, readFileSync } from "node:fs";
import { buildCase } from "./cases";
import type { Case, Label, Row } from "./cases";
import { generatedRows, referenceRows } from "./generate";

/** How many answers generate.ts makes from the practice list. */
export const GENERATED = 120;
/** How many Dudra answers it writes with the reference examples. */
export const REFERENCE = 40;

export function loadCases(dir = "data-private/eval"): Case[] {
  const labels: Record<string, Label> = existsSync(`${dir}/labels.json`) ? JSON.parse(readFileSync(`${dir}/labels.json`, "utf8")) : {};
  const rows = readFileSync(`${dir}/staging-answers.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  const own = rows.map((r, i) => buildCase(r, i, labels as never));
  const hard = existsSync(`${dir}/hard-answers.jsonl`) ? readFileSync(`${dir}/hard-answers.jsonl`, "utf8").split("\n").filter(Boolean).map((l, i) => buildCase(JSON.parse(l) as Row, i, labels as never, "hard")) : [];
  // Dudra pairs written with the reference examples, where the course data has them (data-private/examples-device.json)
  const refFile = existsSync("data-private/examples-device.json") ? JSON.parse(readFileSync("data-private/examples-device.json", "utf8")) : null;
  const ref = refFile ? referenceRows(refFile.items, REFERENCE) : { rows: [], labels: {} };
  const refCases = ref.rows.map((r, i) => buildCase(r, i, { ...labels, ...ref.labels } as never, "ref"));
  return [...own, ...hard, ...generatedRows(GENERATED).map((r, i) => buildCase(r, i, labels as never, "gen")), ...refCases];
}
