// The case set as it stands: the stored answers and the labels in data-private/eval/, built into cases.
import { existsSync, readFileSync } from "node:fs";
import { buildCase } from "./cases";
import type { Case, Label, Row } from "./cases";

export function loadCases(dir = "data-private/eval"): Case[] {
  const labels: Record<string, Label> = existsSync(`${dir}/labels.json`) ? JSON.parse(readFileSync(`${dir}/labels.json`, "utf8")) : {};
  const rows = readFileSync(`${dir}/staging-answers.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
  return rows.map((r, i) => buildCase(r, i, labels as never));
}
