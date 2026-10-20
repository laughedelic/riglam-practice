// Learned facts (docs/SERVER.md): after an explain question, what the answer says of each example the page could not check is kept in
// example_facts (migrations/0009_example_facts.sql), one row per example and category, by the rules of src/domain/learned.ts. A Quorum run counts
// as one analysis with several voices; the one model's answer counts as one voice. `knownFacts` answers POST /api/known from the rows that may be served.
import type { ExplainExample, KnownFact } from "../src/ai/protocol";
import { CELL_NAME } from "../src/ai-shared/prompts";
import { failsCell, wholeFirst } from "../src/domain/known";
import { FACTS_EPOCH, FACT_LIMITS, factKey, knownLine, learn, opinionOf, ruleSide, servable, type FactRow, type FactSource, type Opinion } from "../src/domain/learned";
import type { Answer } from "../src/domain/verdict";
import type { Kit } from "./kit";

/** One answer to the explain question: a model's (the tutor's, or one of Quorum's), or the judge's. */
export interface Analysis {
  name: string;
  model: string;
  text: string;
  judge?: boolean;
}

type Stored = Omit<FactRow, "models"> & { models: string };

async function readRow(db: D1Database, thing: string, cat: string): Promise<FactRow | null> {
  const r = await db
    .prepare("SELECT answer, cls, reason, state, agree, against, src, models, epoch, text, seen, first_day, last_day FROM example_facts WHERE thing = ?1 AND cat = ?2")
    .bind(thing, cat)
    .first<Stored>();
  if (!r) return null;
  let models: FactRow["models"] = [];
  try {
    models = JSON.parse(r.models);
  } catch { /* an audit that cannot be read is not worth failing for */ }
  return { ...r, models };
}

function writeRow(db: D1Database, thing: string, cat: string, row: FactRow, isNew: boolean, maxRows: number): D1PreparedStatement {
  const values = [thing, cat, row.answer, row.cls, row.reason, row.state, row.agree, row.against, row.src, JSON.stringify(row.models), row.epoch, row.text, row.seen, row.first_day, row.last_day];
  if (!isNew)
    return db
      .prepare("UPDATE example_facts SET answer = ?3, cls = ?4, reason = ?5, state = ?6, agree = ?7, against = ?8, src = ?9, models = ?10, epoch = ?11, text = ?12, seen = ?13, first_day = ?14, last_day = ?15 WHERE thing = ?1 AND cat = ?2")
      .bind(...values);
  // a new row only while the table has room, decided in the statement itself; a row that came meanwhile is left as it is
  return db
    .prepare(
      "INSERT OR IGNORE INTO example_facts (thing, cat, answer, cls, reason, state, agree, against, src, models, epoch, text, seen, first_day, last_day) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15 WHERE (SELECT COUNT(*) FROM example_facts) < ?16",
    )
    .bind(...values, maxRows);
}

/**
 * Keeps what the answers say of the learner's examples. `cats` are the pair's two category ids (A, then B) and must be the data's own;
 * `examples` the ones the page named; `analyses` the answers that could be used, the models in their order (weakest first), then the judge.
 * An example the answers do not mention, or one too long to keep, is skipped. Returns how many rows were written.
 */
export async function keepFacts(
  db: D1Database,
  p: { kit: Pick<Kit, "isCat" | "knownClass">; cats: readonly string[]; examples: readonly ExplainExample[]; analyses: readonly Analysis[]; quorum: boolean; day: string; maxRows: number },
): Promise<number> {
  const [catA, catB] = p.cats;
  if (p.cats.length !== 2 || !catA || !catB || catA === catB || !p.kit.isCat(catA) || !p.kit.isCat(catB)) return 0;
  const src: FactSource = p.quorum ? "quorum" : "explain";
  const things = new Map<string, string>();
  for (const e of p.examples.slice(0, FACT_LIMITS.examples)) {
    const k = factKey(e.text);
    if (k && !things.has(k)) things.set(k, e.text.trim());
  }
  const writes: D1PreparedStatement[] = [];
  for (const [thing, text] of things) {
    const said = (a: Analysis): Opinion | null => {
      const o = opinionOf(a.text, text);
      return o ? { ...o, cls: p.kit.knownClass(o.cls), name: a.name, model: a.model, judge: !!a.judge } : null;
    };
    const models = p.analyses.filter((a) => !a.judge).map(said).filter((o): o is Opinion => !!o);
    const judgeOf = p.analyses.find((a) => a.judge);
    const judge = judgeOf ? said(judgeOf) : null;
    for (const [side, cat] of [[0, catA], [1, catB]] as const) {
      const ruling = ruleSide(models, judge, side);
      if (!ruling) continue;
      const stored = await readRow(db, thing, cat);
      writes.push(writeRow(db, thing, cat, learn(stored, ruling, { src, text, day: p.day }), !stored, p.maxRows));
    }
  }
  if (writes.length) await db.batch(writes);
  return writes.length;
}

/**
 * What may be answered of the examples without the AI, as the tutor's line for the cell asked about: an example both of whose rows (one per category of
 * the pair) may be served (`servable`), and one with a single servable row when that row already fails the cell (a half line, with "unsure" for the other
 * side: the page marks the example as not fitting at once, and the tutor still says the rest). `cats` must be the data's own two; anything else is
 * answered with nothing.
 */
export async function knownFacts(
  db: D1Database,
  p: { kit: Pick<Kit, "isCat">; cats: readonly string[]; examples: readonly ExplainExample[]; epoch?: number },
): Promise<KnownFact[]> {
  const [catA, catB] = p.cats;
  if (p.cats.length !== 2 || !catA || !catB || catA === catB || !p.kit.isCat(catA) || !p.kit.isCat(catB)) return [];
  const asked = p.examples.slice(0, FACT_LIMITS.examples).map((e) => ({ ...e, key: factKey(e.text) })).filter((e): e is ExplainExample & { key: string } => !!e.key);
  const things = [...new Set(asked.map((e) => e.key))];
  if (!things.length) return [];
  const marks = things.map((_, i) => `?${i + 3}`).join(", ");
  const { results } = await db
    .prepare(`SELECT thing, cat, answer, cls, reason, state, epoch FROM example_facts WHERE cat IN (?1, ?2) AND thing IN (${marks})`)
    .bind(catA, catB, ...things)
    .all<Pick<FactRow, "answer" | "cls" | "reason" | "state" | "epoch"> & { thing: string; cat: string }>();
  const row = new Map(results.filter((r) => servable(r, p.epoch ?? FACTS_EPOCH)).map((r) => [`${r.thing}\n${r.cat}`, r]));
  const out: KnownFact[] = [];
  const unknown = { answer: "unsure" as Answer, reason: "", cls: "" };
  for (const e of asked) {
    const a = row.get(`${e.key}\n${catA}`), b = row.get(`${e.key}\n${catB}`);
    if (!a && !b) continue;
    const half = !a || !b;
    if (half && !failsCell(e.cell, (a ?? unknown).answer, (b ?? unknown).answer)) continue;
    const known = [a, b].filter((r) => !!r);
    out.push({
      cell: e.cell,
      text: e.text,
      line: knownLine(CELL_NAME[e.cell], e.text, a ?? unknown, b ?? unknown),
      by: known.every((r) => r.state === "reviewed") ? "reviewed" : "learned",
      ...(half ? { half: true as const } : {}),
    });
  }
  return wholeFirst(out);
}
