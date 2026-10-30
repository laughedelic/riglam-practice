// Prints the cases and the examples that still need a label (a quick look while building the set).
import { readFileSync, existsSync } from "node:fs";
import { buildCase, labelKey } from "./cases";
import type { Row } from "./cases";
const rows = readFileSync("data-private/eval/staging-answers.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);
const labels = existsSync("data-private/eval/labels.json") ? JSON.parse(readFileSync("data-private/eval/labels.json", "utf8")) : {};
let need = 0;
rows.forEach((r, i) => {
  const c = buildCase(r, i, labels);
  const lines = c.examples.map((e) => `   ${e.cell} ${JSON.stringify(e.text)} page=${e.page} ${e.want ? `want A ${e.want.a} B ${e.want.b} (${e.from})` : "NEEDS LABEL key=" + labelKey(c.pair, e.text)}`);
  need += c.examples.filter((e) => !e.want).length;
  console.log(`${c.id} ${c.mode} [${c.pair.a}] x [${c.pair.b}] rel=${c.pair.relation}${c.pair.own ? " OWN" : ""}${c.pair.neg ? " neg=" + c.pair.neg : ""}\n${lines.join("\n")}`);
});
console.log("examples needing a label:", need);
