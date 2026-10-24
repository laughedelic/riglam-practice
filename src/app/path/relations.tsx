// Relations on the Path: 1 the relation (the five as choices on the path), 2 the examples (examples.tsx), 3 the result (the pair with your
// relation marked, the verdict, a row for each case, Why from the tutor). The rules are the classic page's (practice/screen.js, grading.js,
// src/domain): the Path draws the same attempt, `state.ui`, and calls the same steps.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { CELLS, ORDER, REL, notaOf } from "../core/rel.js";
import { check } from "../practice/grading.js";
import { next } from "../practice/queue.js";
import { choose, explainParts, fillable, learnedThing, nextFwd } from "../practice/screen.js";
import { render } from "../shell/render.js";
import { CELL_NAME } from "../../ai-shared/prompts.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { grade } from "../../domain/grading.ts";
import type { GradeResult } from "../../domain/types.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ScanPlan, Verdict3 } from "./scan.tsx";
import { ExamplesStep, StripPair, examplesReady } from "./examples.tsx";
import { CASE, Choices, ErrLines, PairResult, PairStops, Thinking, TutorNote, Verdict, WhyRow, isa, pairOf, pickThen, u0 } from "./parts.tsx";
import { FlagBtn, FlagEditor, explainCase } from "./flags.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, PreStation, SkipSide, Station, TopBar, VoiceBar } from "./shell.tsx";
import { Subjects, markNames } from "./subjects.tsx";
import { D, Fig, Gap, Head, Mark, St, Sx } from "./ui.tsx";

/** the relation picked (the steps after the first have one) */
const relOf = () => u0().rel as RelKey;

/** The five relations as choices on the path: their figures in the margin, the sign in the notation picked. */
export function relChoices(p: { a: string; b: string }, cur: string | null) {
  return ORDER.map((k, i) => {
    const r = REL[k as RelKey];
    return { k, b: r.name, s: <Subjects text={r.gloss(p.a, p.b)} p={p} />, fig: k, sym: state.nota !== "codes" ? notaOf(k) : "", key: String(i + 1), pressed: cur === k };
  });
}

/* ---------- 1 the relation ---------- */
function PickStep({ kb }: { kb: boolean }) {
  const u = u0(), p = pairOf(), retry = state.cur!.retry;
  const pick = (k: string) => { if (u.checked || u.late) return; pickThen(k, () => { u.pall = false; choose(k); }); };
  return <>
    <Scroll>
      {retry ? <p class="retry">{(state.cur!.tag || "Retry") + (state.retryQ.length ? " · " + state.retryQ.length + " more" : "")}</p> : null}
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Relation" sub="how do A and B relate?" /><Gap h={4} /><PairStops p={p} /><Gap h={8} /></Sx>
      <Choices label="Relation" slide items={relChoices(p, u.rel || null)} picked={u.pk} onPick={pick} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    {kb ? null : <Foot aux={<SkipSide />}>
      {u.rel ? <Station name="Examples" hint="the relation you picked" act={() => { u.open = false; render(); }} /> : <PreStation name="Examples" hint="pick a relation first" />}
    </Foot>}
  </>;
}

/* ---------- 2 the examples: what the strip shows unfolded ---------- */
function Picked() {
  const u = u0(), p = pairOf(), r = REL[relOf()];
  return <>
    <StripPair q="How do the two terms relate?" />
    <Sx cls="walked"><Gap h={10} />
      <St d={<Fig k={relOf()} size="m" />}><span class="relnm"><b class="yours">{r.name}</b>{state.nota !== "codes" ? <span class="rsym">{notaOf(relOf())}</span> : null}</span>
        <span class="pq relg"><Subjects text={r.gloss(p.a, p.b)} p={p} />. {u.late ? "Time ran out: this is the relation." : "Yours, not checked yet."}</span>
        {u.late ? null : <button type="button" class="pbtn" onClick={() => { u.open = true; u.pstrip = false; render(); }}>Pick another</button>}</St><Gap h={6} /></Sx>
  </>;
}

/* ---------- 3 the result ---------- */
/** A case at the result: the example, its mark, and what the check (or the tutor) says of it; an open one can be sent to the tutor. */
export function Row({ c, rel }: { c: CellId; rel: RelKey }) {
  const u = u0(), r = u.res, cr = r.cells[c] as { v: string; msg: string[] }, p = pairOf(), out = REL[rel].empty.includes(c), x = u.cells[c], t = (x.t || "").trim();
  const open = cr.v === "cmp" || cr.v === "open", m = cr.v === "ok" ? "ok" : cr.v === "bad" ? "no" : "pt", busy = open && !!u.ctl;
  const tnote: string | undefined = (explainParts().cells as Record<string, string>)[c], key = (p.ex && p.ex[c]) || "";
  const ans = out ? <span class="ans2 nil">not asked by {u.find ? "the relation" : "your relation"}</span> : t ? <span class={"ans2" + (m === "no" ? " no" : "")}>{t}</span> : <span class="ans2 nil">{x.none ? "nothing exists" : "left empty"}</span>;
  const note = out ? <>you left this case out{key ? <>; for example <span class="fix">{key}</span></> : null}</>
    : open ? <>unchecked: the list does not know it yet{key ? <>; the course's example: <span class="fix">{key}</span></> : null}</>
    : <><b>{cr.msg[0]}</b>{cr.msg[2] ? <i>{cr.msg[2]}</i> : null}{markNames(isa(cr.msg[1] || ""), p)}</>;
  return <St d={<D cls={"sub " + (busy ? "pthink" : m)} />} cls={"sb exr" + (tnote ? " tut" : "")}>
    <span class="lab">{CASE[c]}</span><div class="line1">{ans}{busy ? null : <Mark m={m} />}</div>
    {tnote ? <TutorNote c={c} text={tnote} where={"pc" + c} flag={<FlagBtn c={explainCase(tnote, c, CELL_NAME[c], learnedThing(c))} where={"pop:" + c} />} /> : <p class="xnote">{note}</p>}
    <FlagEditor where={"pop:" + c} />
    {busy ? <Thinking label="the tutor is checking" /> : null}
  </St>;
}
/** The rows of a result: the cases the relation asked for, and a case it left out that was wrongly filled. */
export const resultRows = (rel: RelKey) => CELLS.filter((c) => !REL[rel].empty.includes(c) || u0().res.cells[c].v === "bad") as CellId[];
export const isOpen = (c: CellId) => { const v = u0().res.cells[c].v; return v === "cmp" || v === "open"; };
export const cases = (n: number) => (n === 1 ? "one case" : n + " cases");
/** The verdict of a result `r` as the result's node says it: its color, its word and the line beside it. */
function verdictOf(r: Pick<GradeResult, "cells" | "overall">, rel: RelKey): { v: Verdict3; word: string; sub: string; unc: number; nbad: number; rows: CellId[] } {
  const u = u0(), cell = (c: CellId) => r.cells[c].v;
  const rows = CELLS.filter((c) => !REL[rel].empty.includes(c) || cell(c as CellId) === "bad") as CellId[];
  const unc = rows.filter((c) => cell(c) === "cmp" || cell(c) === "open").length, nbad = rows.filter((c) => cell(c) === "bad").length, nex = rows.filter((c) => !REL[rel].empty.includes(c)).length;
  const ov: string = r.overall, v = ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right", bad: "Not quite" } as Record<string, string>)[ov] || "Not quite";
  const sub = (ov === "pend" ? unc + " unchecked" + (u.ctl ? " · the tutor is on it" : "") : ov === "ok" ? "your relation and " + (nex === 1 ? "one example" : nex + " examples")
    : ov === "part" ? cases(nbad) + " to look at" : u.late ? "time ran out on the relation" + (nbad ? "; " + cases(nbad) + " to look at" : "") : "the relation" + (nbad ? " and " + cases(nbad) : "")) + (u.exLate ? " · time ran out on the examples" : "");
  return { v, word, sub, unc, nbad, rows };
}
/** What the scan of the Check marks on its way (scan.tsx): the verdict of each case written, in the order of the page, the relation's, and the result's. Graded as the
 *  check will grade it (src/domain), before the check itself, which comes when the scan is over. */
function scanPlan(): ScanPlan {
  const u = u0(), r = grade(state as unknown as DataIndex, state.cur!.p, u), rel = relOf(), m = (c: CellId) => { const v = r.cells[c].v; return v === "ok" ? "ok" : v === "bad" ? "no" : "pt"; };
  const { v, word, sub } = verdictOf(r, rel);
  return { cases: (fillable() as CellId[]).map(m), rel: r.relOpen ? "pt" : r.relOk ? "ok" : "no", v, word, sub, next: nextFwd().label };
}
function ResultStep() {
  const u = u0(), p = pairOf(), r = u.res, rel = relOf();
  const { v, word, sub: vsub, unc, nbad, rows } = verdictOf(r as GradeResult, rel);
  return <>
    <Scroll>
      <PairResult mine={rel} ok={!!r.relOk} right={p.relation} none={u.late ? "no relation" : undefined} />
      <Verdict v={v} word={word} sub={vsub} />
      <Sx cls={nbad ? "nop" : "okp"}><Gap h={2} />{rows.map((c) => <Row c={c} rel={rel} />)}</Sx>
      <WhyRow unc={unc} again={!!r.relOpen} />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextFwd().label} act={() => next()} /></Foot>
  </>;
}

/** The screen of Relations: its top bar and the step the attempt is at. */
export function relationsScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0(), step = u.checked ? 3 : !u.rel || u.open ? 1 : 2;
  const top = <TopBar title="Relations" tools mic />;
  if (step === 1) return { cls: "", node: <>{top}<PickStep kb={kb} /></> };
  if (step === 2) return { cls: examplesReady() ? "ready" : "", node: <>{top}<ExamplesStep kb={kb} title="Relations" step={2} rel={relOf()} full={<Picked />} check={check} scan={scanPlan} /></> };
  return { cls: "done", node: <>{top}<ResultStep /></> };
}
