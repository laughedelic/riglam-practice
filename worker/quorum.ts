// Quorum, the tutor's mode on a Preview (docs/SERVER.md): an explain question is answered by several models, each with the tutor's instructions and tools,
// and where they give different cells to an example the judge (Opus again) reads their answers, settles the example itself and writes the answer the learner
// sees. When they agree, the strongest model's answer is the one shown, as it is. Nothing is streamed while the models work: the learner gets the finished
// text, and `step` events say how far it is. The whole run is kept as a row of quorum_records (migrations/0008_quorum_records.sql).
// It uses only the tutor's code (runTutor with another model), so it answers as the tutor does and is counted from Quorum's own budget (budget.ts).

import Anthropic from "@anthropic-ai/sdk";
import { CELL_NAME, judgeNote } from "../src/ai-shared";
import { QUORUM, type QuorumRecord, type QuorumRun, type TutorEvent, type TutorRequest } from "../src/ai/protocol";
import { divided, quorumRows, type QuorumRow } from "../src/domain/quorum";
import type { Config } from "./config";
import type { Kit } from "./kit";
import { addTokens, noTokens } from "./prices";
import { runTutor, withFinePoints, type Outcome } from "./tutor";

type Emit = (e: TutorEvent) => Promise<void>;

/** What is stored of a run (one row of quorum_records). */
export interface StoredRecord {
  id: string;
  at: Date;
  day: string;
  device: string;
  request: TutorRequest;
  runs: QuorumRun[];
  rows: QuorumRow[];
  shown: string;
  judged: boolean;
  disputed: number;
  micro: number;
  outcome: string;
}

const PROMPT_CHARS = 6000;

export async function saveRecord(db: D1Database, r: StoredRecord): Promise<void> {
  await db
    .prepare(
      "INSERT INTO quorum_records (id, at, day, device, kind, cats, prompt, things, runs, shown, judged, disputed, micro, outcome) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    )
    .bind(
      r.id,
      r.at.toISOString(),
      r.day,
      r.device,
      r.request.kind,
      JSON.stringify(r.request.cats),
      (r.request.turns[0]?.content ?? "").slice(0, PROMPT_CHARS),
      JSON.stringify(r.rows),
      JSON.stringify(r.runs),
      r.shown,
      r.judged ? 1 : 0,
      r.disputed,
      r.micro,
      r.outcome,
    )
    .run();
}

function shuffled<T>(a: readonly T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** What a call says of an example, in words for the judge. */
function says(row: QuorumRow, name: string): string {
  if (!(name in row.cells)) return "does not mention it";
  const cell = row.cells[name];
  return cell ? CELL_NAME[cell] : "is unsure";
}

/** The request the judge answers: the learner's, with the fine points in place, then the drafts after the last turn. */
function judgeRequest(request: TutorRequest, kit: Kit, note: string): TutorRequest {
  const turns = withFinePoints(request.turns, kit.finePoints(request.cats));
  const last = turns[turns.length - 1];
  return { ...request, cats: [], turns: [...turns.slice(0, -1), { ...last, content: last.content + "\n\n" + note }] };
}

/**
 * Runs an explain question as Quorum. Never throws. `emit` gets the steps, the shown text as one delta, the record, and `done` (or the caller turns `error` into
 * an event). The row is saved first when an answer could be used, also when the page has gone away. The returned outcome counts every call.
 */
export async function runQuorum(p: {
  client: Anthropic;
  kit: Kit;
  config: Config;
  request: TutorRequest;
  emit: Emit;
  signal: AbortSignal;
  device: string;
  day: string;
  now: Date;
  save: (r: StoredRecord) => Promise<void>;
  id?: string;
}): Promise<Outcome> {
  const { client, kit, config, request, signal } = p;
  const id = p.id ?? crypto.randomUUID();
  // the page may have gone away: the models are paid for and the row is worth keeping, so the run goes on
  const emit: Emit = async (e) => {
    try {
      await p.emit(e);
    } catch {
      /* nobody is listening */
    }
  };
  const tokens = noTokens();
  let micro = 0;
  let rounds = 0;

  const call = async (who: { id: string; name: string }, effort: Config["effort"], req: TutorRequest): Promise<QuorumRun> => {
    let text = "";
    let truncated = false;
    const t0 = Date.now();
    const o = await runTutor({
      client,
      kit,
      config,
      request: req,
      signal,
      model: who.id,
      effort,
      emit: async (e) => {
        if (e.type === "delta") text += e.text;
        else if (e.type === "done") truncated = e.truncated;
      },
    });
    micro += o.micro;
    rounds += o.rounds;
    addTokens(tokens, { input_tokens: o.tokens.input, output_tokens: o.tokens.output, cache_creation_input_tokens: o.tokens.cacheWrite, cache_read_input_tokens: o.tokens.cacheRead });
    const ok = (o.outcome === "answered" || o.outcome === "truncated") && text.trim() !== "";
    const run: QuorumRun = { name: who.name, model: who.id, text: ok ? text.trim() : "", ok, ms: Date.now() - t0, ...(ok && truncated ? { truncated: true } : {}), ...(ok ? {} : { error: o.error?.code ?? "unavailable" }) };
    await emit({ type: "step", name: who.name, ok });
    return run;
  };
  const result = (outcome: Outcome["outcome"], error?: Outcome["error"]): Outcome => ({ tokens, micro, rounds, outcome, ...(error ? { error } : {}) });

  const models = await Promise.all(QUORUM.models.map((m) => call(m, config.effort, request)));
  const usable = models.filter((r) => r.ok);
  if (!usable.length) {
    if (signal.aborted) return result("aborted");
    return result("error", { code: "unavailable", message: "The tutor could not answer." });
  }

  // the judge is asked where at least two answers gave different cells for an example
  const modelRows = quorumRows(usable);
  const differ = modelRows.filter(divided);
  let judge: QuorumRun | null = null;
  if (usable.length >= 2 && differ.length && !signal.aborted) {
    const drafts = shuffled(usable);
    const note = judgeNote(
      drafts.map((d) => d.text),
      differ.map((row) => ({ example: row.example, says: drafts.map((d) => says(row, d.name)) })),
    );
    judge = await call(QUORUM.judge, "high", judgeRequest(request, kit, note));
  }
  // the judge's text when it ruled; else the strongest answer that came (the models are listed weakest first)
  const shown = judge?.ok ? judge : usable[usable.length - 1];
  const outcome = shown.truncated ? "truncated" : "answered";
  const runs = judge ? [...models, judge] : models;
  const rows = quorumRows(judge?.ok ? [...usable, judge] : usable);

  try {
    await p.save({ id, at: p.now, day: p.day, device: p.device, request, runs, rows, shown: shown.name, judged: !!judge, disputed: differ.length, micro, outcome });
  } catch (e) {
    console.error("quorum record not saved", e instanceof Error ? e.name : typeof e);
  }
  const record: QuorumRecord = { id, models, judge, shown: shown.name, why: judge ? "disagree" : null };
  await emit({ type: "delta", text: shown.text });
  await emit({ type: "quorum", record });
  await emit({ type: "done", truncated: !!shown.truncated });
  return result(outcome);
}
