// Reads the tutor's lines on debated sides (the label says the sources or the readings differ) and asks a judge model whether the tutor
// was upfront about it: did it name the readings, or present one as the only answer? Code cannot tell, and no answer there is right or wrong.
// One JSON line per judged side; a side already in --out is skipped. Calls the Anthropic API (RIGLAM_EVAL_API_KEY, else ANTHROPIC_API_KEY).
//
//   node .cache/eval/judge.js data-private/eval/runs/base2.jsonl --out data-private/eval/runs/base2-judge.jsonl [--model claude-opus-5-5]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { parseFactLine } from "../../src/domain/verdict";
import { gradeReply } from "./grade";
import { loadCases } from "./load";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const runs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const out = flag("--out") ?? "data-private/eval/runs/judge.jsonl";
const model = flag("--model") ?? "claude-opus-5-5";

const RUBRIC = `You check one line an AI tutor wrote for a learner of Gelug Collected Topics (Dudra). The line says whether an example is A and whether it is B, with a reason for each. On the side you are asked about, the sources or the readings differ, so no single answer is right; the note below says how.
The tutor is meant to be upfront there: name the reading each answer rests on (or say the sources differ) and leave the question open, rather than present one reading as the only one.
Answer with one line of JSON and nothing else: {"names_readings": true|false, "one_as_only": true|false, "why": "<at most 20 words>"}
names_readings: the side's answer or reason names at least two readings, or says the sources differ. one_as_only: it states one reading as settled fact without a word about another.`;

async function main() {
  const apiKey = process.env.RIGLAM_EVAL_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("neither RIGLAM_EVAL_API_KEY nor ANTHROPIC_API_KEY is set");
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 4 });
  const cases = new Map(loadCases().map((c) => [c.id, c]));
  const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.case}|${j.config}|${j.rep}|${j.cell}|${j.side}`; }) : []);
  let micro = 0;
  for (const file of runs) for (const ln of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const l = JSON.parse(ln), c = cases.get(l.case);
    if (!c || !l.text) continue;
    const g = gradeReply(c, l.text);
    for (const e of g.examples) for (const k of ["a", "b"] as const) {
      if (e[k] !== "debated") continue;
      const key = `${l.case}|${l.config}|${l.rep}|${e.cell}|${k}`;
      if (done.has(key)) continue;
      const line = l.text.split("\n").filter((x: string) => parseFactLine(x)?.cell === e.cell).at(-1) ?? "";
      const ex = c.examples.find((x) => x.cell === e.cell);
      const msg = `A: ${c.pair.a}\nB: ${c.pair.b}\nExample: "${e.text}"\nSide asked about: ${k.toUpperCase()}\nHow the readings differ: ${ex?.want?.why ?? "(no note)"}\nThe tutor's line: ${line}`;
      const r = await client.messages.create({ model, max_tokens: 2000, system: RUBRIC, messages: [{ role: "user", content: msg }], output_config: { effort: "low" } } as never) as Anthropic.Message;
      const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      let v: { names_readings?: boolean; one_as_only?: boolean; why?: string };
      try { v = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch { v = { why: "unreadable: " + text.slice(0, 80) }; }
      // Opus 5.5: 4 USD in, 20 USD out per million tokens (worker/prices.ts)
      micro += r.usage.input_tokens * 4 + r.usage.output_tokens * 20;
      appendFileSync(out, JSON.stringify({ case: l.case, config: l.config, rep: l.rep, cell: e.cell, side: k, text: e.text, said: e.said[k === "a" ? 0 : 1], ...v, judge: model }) + "\n");
    }
  }
  console.error(`judge spent about ${(micro / 1e6).toFixed(2)} USD`);
}
main().catch((e) => { console.error(e); process.exit(1); });
