// Sums up eval runs (run.ts) per config: how often the tutor's facts match the labels, the errors by kind, the form rules, cost and time.
// The interval is a bootstrap over cases (95%), so it shows whether two configs differ by more than the noise.
//
//   node .cache/eval/report.js data-private/eval/runs/*.jsonl [--split train|test] [--md out.md] [--regrade]
//
// --regrade grades the stored answers again with today's cases and labels, so a corrected label costs no new call.
import { readFileSync, writeFileSync } from "node:fs";
import { splitOf } from "./split";
import { gradeReply, type Grade } from "./grade";
import { loadCases } from "./load";

interface Line { case: string; mode: string; config: string; rep: number; ms: number; outcome: string; micro: number; text: string; grade: Grade }
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const split = flag("--split");
const lines: Line[] = files.flatMap((f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Line)).filter((l) => !split || splitOf(l.case) === split);
if (args.includes("--regrade")) {
  const byId = new Map(loadCases().map((c) => [c.id, c]));
  for (const l of lines) { const c = byId.get(l.case); if (c && l.text) l.grade = gradeReply(c, l.text); }
}

const pct = (x: number) => (100 * x).toFixed(1) + "%";
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Per case: sides right and sides in all, so the bootstrap draws whole cases. */
function perCase(ls: Line[]) {
  const m = new Map<string, { right: number; n: number; wrong: number }>();
  for (const l of ls) {
    const s = m.get(l.case) ?? { right: 0, n: 0, wrong: 0 };
    for (const e of l.grade.examples) for (const k of ["a", "b"] as const) { if (e[k] === "debated") continue; s.n++; if (e[k] === "right") s.right++; if (e[k] === "wrong") s.wrong++; }
    m.set(l.case, s);
  }
  return [...m.values()];
}
function ci(cs: { right: number; n: number }[]): [number, number] {
  const r = rng(7), xs: number[] = [];
  for (let i = 0; i < 2000; i++) { let a = 0, b = 0; for (let j = 0; j < cs.length; j++) { const c = cs[Math.floor(r() * cs.length)]; a += c.right; b += c.n; } xs.push(a / b); }
  return [q(xs, 0.025), q(xs, 0.975)];
}

const out: string[] = [];
const say = (s = "") => { out.push(s); console.log(s); };
say(`# Tutor eval${split ? ` (${split} cases)` : ""}`);
say();
say("Sides right counts the settled sides only; a debated side (the readings differ) is left to a reader or a judge and counted apart.");
say();
say("| Config | Answers | Sides right (95% CI) | Wrong | Hedged | Over-sure | Missing | Debated | Fit right | Form issues | Cost per answer | Time p50 / p90 |");
say("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
const configs = [...new Set(lines.map((l) => l.config))];
for (const cfg of configs) {
  const ls = lines.filter((l) => l.config === cfg);
  const all = ls.flatMap((l) => l.grade.examples.flatMap((e) => [e.a, e.b]));
  const marks = all.filter((m) => m !== "debated");
  const cnt = (m: string) => marks.filter((x) => x === m).length;
  const fits = ls.flatMap((l) => l.grade.examples.map((e) => e.fitRight)).filter((x) => x !== null);
  const form = ls.filter((l) => { const f = l.grade.form; return f.doubled.length || f.reversal || f.markdown || f.ownName || f.onlyInPervasion || f.noLocus || f.noPervasion || f.noRelation; }).length;
  const [lo, hi] = ci(perCase(ls));
  const failed = ls.filter((l) => l.outcome !== "answered").length;
  say(`| ${cfg} | ${ls.length}${failed ? ` (${failed} failed)` : ""} | ${pct(cnt("right") / marks.length)} (${pct(lo)} to ${pct(hi)}) | ${cnt("wrong")} | ${cnt("hedged")} | ${cnt("overconfident")} | ${cnt("missing")} | ${all.length - marks.length} | ${pct(fits.filter(Boolean).length / Math.max(1, fits.length))} | ${form} | ${(ls.reduce((s, l) => s + l.micro, 0) / ls.length / 1e6).toFixed(4)} USD | ${(q(ls.map((l) => l.ms), 0.5) / 1000).toFixed(0)} / ${(q(ls.map((l) => l.ms), 0.9) / 1000).toFixed(0)} s |`);
}
say();
say("## Wrong facts (yes for no or no for yes), by example");
say();
for (const cfg of configs) {
  const bad = new Map<string, number>();
  for (const l of lines.filter((x) => x.config === cfg)) for (const e of l.grade.examples) for (const k of ["a", "b"] as const) if (e[k] === "wrong") { const key = `${l.case} ${e.cell} "${e.text}" side ${k.toUpperCase()} said ${e.said[k === "a" ? 0 : 1]}`; bad.set(key, (bad.get(key) ?? 0) + 1); }
  say(`- **${cfg}:** ${bad.size ? [...bad].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}${n > 1 ? ` (x${n})` : ""}`).join("; ") : "none"}`);
}
say();
say("## Debated sides: what each config said");
say();
for (const cfg of configs) {
  const said = new Map<string, number>();
  for (const l of lines.filter((x) => x.config === cfg)) for (const e of l.grade.examples) for (const k of ["a", "b"] as const) if (e[k] === "debated") { const key = `${l.case} "${e.text}" side ${k.toUpperCase()} ${e.said[k === "a" ? 0 : 1]}`; said.set(key, (said.get(key) ?? 0) + 1); }
  say(`- **${cfg}:** ${said.size ? [...said].sort().map(([k, n]) => `${k}${n > 1 ? ` (x${n})` : ""}`).join("; ") : "none"}`);
}
const md = flag("--md");
if (md) writeFileSync(md, out.join("\n") + "\n");
