// Runs the tutor eval: every case, on every model and effort asked for, a number of times, straight through the Anthropic API with the
// tutor's own code (worker/tutor.ts runTutor, the kit of worker/kit.ts), and grades each answer with grade.ts. One JSON line per answer.
//
//   RIGLAM_EVAL_API_KEY=... (or ANTHROPIC_API_KEY=...) node .cache/eval/run.mjs --configs claude-sonnet-5-5:medium,claude-haiku-5-5:medium --repeats 3 --out data-private/eval/runs/base.jsonl
//
//   --configs <model:effort,...>  (default: the tutor's own, claude-sonnet-5-5:medium)    --repeats <n> (default 1)
//   --cases <id,...|prefix>       only these cases                                     --budget <USD> stop starting new calls past this (default 30)
//   --concurrency <n>             (default 4)                                          --dry   build the cases, print a summary and the first request, call nothing
//   --split train|test            only the cases of one half (split.ts)
// A line already in --out (same case, config and repeat) is skipped, so a stopped run goes on where it stopped.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import DATA from "../../src/data/drill-data.json";
import { kitFrom } from "../../worker/kit";
import { runTutor } from "../../worker/tutor";
import type { Config } from "../../worker/config";
import { loadCases } from "./load";
import { gradeReply } from "./grade";
import { splitOf } from "./split";

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = (n: string) => args.includes(n);

async function main() {
  const out = flag("--out") ?? "data-private/eval/runs/run.jsonl";
  const configs = (flag("--configs") ?? "claude-sonnet-5-5:medium").split(",").map((s) => { const [model, effort] = s.split(":"); return { model, effort: (effort || "medium") as Config["effort"], name: `${model}:${effort || "medium"}` }; });
  const repeats = Number(flag("--repeats") ?? 1), budget = Number(flag("--budget") ?? 30) * 1_000_000, conc = Number(flag("--concurrency") ?? 4);
  let cases = loadCases();
  const only = flag("--cases");
  if (only) { const ids = only.split(","); cases = cases.filter((c) => ids.some((x) => c.id === x || c.id.startsWith(x))); }
  const split = flag("--split");
  if (split) cases = cases.filter((c) => splitOf(c.id) === split);
  const n = cases.reduce((s, c) => s + c.examples.length, 0);
  console.error(`${cases.length} cases, ${n} examples (${cases.reduce((s, c) => s + c.examples.filter((e) => e.want).length, 0)} labelled); ${configs.length} configs x ${repeats} repeats = ${cases.length * configs.length * repeats} calls`);
  if (has("--dry")) { console.error(cases[0].request.turns[0].content); return; }
  // A cloud session does not pass ANTHROPIC_API_KEY through to its shell, so the eval key may come as RIGLAM_EVAL_API_KEY.
  const apiKey = process.env.RIGLAM_EVAL_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("neither RIGLAM_EVAL_API_KEY nor ANTHROPIC_API_KEY is set");

  const kit = await kitFrom(DATA, {
    definitions: readFileSync("data-private/definitions.json", "utf8"),
    notes: readFileSync("data-private/notes.json", "utf8"),
    examples: existsSync("data-private/examples-device.json") ? readFileSync("data-private/examples-device.json", "utf8") : null,
  });
  const client = new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", maxRetries: 4 });
  const base: Config = { model: "claude-sonnet-5-5", effort: "medium", maxTokens: 6000, maxRounds: 4, deviceDailyMicro: 0, globalDailyMicro: 0, reserveMicro: 0 };
  const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.case}|${j.config}|${j.rep}`; }) : []);
  const todo = configs.flatMap((cfg) => Array.from({ length: repeats }, (_, rep) => cases.map((c) => ({ c, cfg, rep })))).flat().filter((t) => !done.has(`${t.c.id}|${t.cfg.name}|${t.rep}`));
  console.error(`${done.size} already in ${out}; ${todo.length} to run`);
  let spent = 0, next = 0, finished = 0, stopped = false;
  const worker = async () => {
    while (!stopped && next < todo.length) {
      if (spent >= budget) { stopped = true; console.error(`budget reached: ${(spent / 1e6).toFixed(2)} USD`); break; }
      const { c, cfg, rep } = todo[next++];
      let text = "";
      const t0 = Date.now();
      const o = await runTutor({
        client, kit, config: base, request: c.request, model: cfg.model, effort: cfg.effort, signal: new AbortController().signal,
        onRound: () => { text = ""; },
        emit: async (e) => { if (e.type === "delta") text += e.text; },
      });
      spent += o.micro;
      const g = gradeReply(c, text);
      appendFileSync(out, JSON.stringify({ case: c.id, mode: c.mode, config: cfg.name, rep, at: new Date().toISOString(), ms: Date.now() - t0, outcome: o.outcome, error: o.error ?? null, rounds: o.rounds, tokens: o.tokens, micro: o.micro, text, grade: g }) + "\n");
      const wrong = g.examples.filter((e) => e.a === "wrong" || e.b === "wrong").length;
      console.error(`${++finished}/${todo.length} ${cfg.name} ${c.id} r${rep} ${o.outcome} ${((Date.now() - t0) / 1000).toFixed(0)}s ${(o.micro / 1e6).toFixed(3)} USD${wrong ? ` wrong:${wrong}` : ""}`);
      if (o.outcome === "error" && o.error?.code !== "rate_limited") console.error("  ", o.error);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  console.error(`spent ${(spent / 1e6).toFixed(2)} USD${stopped ? " (stopped early; run again to go on)" : ""}`);
}

await main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
