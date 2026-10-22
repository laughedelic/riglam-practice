// Relations on the Path: 1 the relation (the five as choices on the path), 2 the examples (examples.tsx), 3 the result (the pair with your
// relation marked, the verdict, a row for each case, Why from the tutor). The rules are the classic page's (practice/screen.js, grading.js,
// src/domain): the Path draws the same attempt, `state.ui`, and calls the same steps.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { CELLS, ORDER, REL, notaOf } from "../core/rel.js";
import { check } from "../practice/grading.js";
import { next } from "../practice/queue.js";
import { choose, explainParts, learnedThing, nextFwd } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { render } from "../shell/render.js";
import { CELL_NAME } from "../../ai-shared/prompts.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { ExamplesStep, StripPair, examplesReady } from "./examples.tsx";
import { CASE, Choices, ErrLines, PairResult, PairStops, TermsRow, Thinking, Verdict, WhyRow, askTutor, isa, needsKey, pairOf, pickThen, tutorOnResult, tutorWaiting, u0 } from "./parts.tsx";
import { FlagBtn, FlagEditor, explainCase } from "./flags.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, PreStation, SideStation, Station, TopBar, VoiceBar } from "./shell.tsx";
import { DefCard, TermText } from "./terms.tsx";
import { D, Fig, Gap, Head, Mark, St, Sx } from "./ui.tsx";

/** the relation picked (the steps after the first have one) */
const relOf = () => u0().rel as RelKey;

/** The five relations as choices on the path: their figures in the margin, the sign in the notation picked. */
export function relChoices(p: { a: string; b: string }, cur: string | null) {
  return ORDER.map((k, i) => {
    const r = REL[k as RelKey];
    return { k, b: r.name, s: r.gloss(p.a, p.b), fig: k, sym: state.nota !== "codes" ? notaOf(k) : "", key: String(i + 1), pressed: cur === k };
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
      <Choices label="Relation" items={relChoices(p, u.rel || null)} picked={u.pk} onPick={pick} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    {kb ? null : <Foot aux={<SideStation kind="skip" act={skipPair} />}>
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
        <span class="pq relg">{r.gloss(p.a, p.b)}. {u.late ? "Time ran out: this is the relation." : "Yours, not checked yet."}</span>
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
  const note = tnote ? <><span class="tutn">the tutor:</span> <TermText text={tnote} where={"pc" + c} /></>
    : out ? <>you left this case out{key ? <>; for example <span class="fix">{key}</span></> : null}</>
    : open ? <>unchecked: the list does not know it yet{key ? <>; the course's example: <span class="fix">{key}</span></> : null}</>
    : <><b>{cr.msg[0]}</b>{cr.msg[2] ? <i>{cr.msg[2]}</i> : null}{isa(cr.msg[1] || "")}</>;
  const side = open && !busy && !(u.explained && !r.relOpen) && (canAsk() || needsKey());
  return <St d={<D cls={"sub " + (busy ? "pthink" : m)} />} cls={"sb exr" + (tnote ? " tut" : "")}>
    <span class="lab">{CASE[c]}</span><div class="line1">{ans}{busy ? null : <Mark m={m} />}</div>
    <p class="xnote">{note}{tnote ? <FlagBtn c={explainCase(tnote, c, CELL_NAME[c], learnedThing(c))} where={"pop:" + c} /> : null}</p>{tnote ? <DefCard where={"pc" + c} /> : null}
    <FlagEditor where={"pop:" + c} />
    {busy ? <Thinking label="the tutor is checking" /> : null}
    {side ? <button type="button" class="tside" aria-disabled={needsKey() ? "true" : undefined} onClick={() => askTutor(false)}><span class="tsd" /><b>Check and explain</b><span class="tsl" /></button> : null}
  </St>;
}
/** The rows of a result: the cases the relation asked for, and a case it left out that was wrongly filled. */
export const resultRows = (rel: RelKey) => CELLS.filter((c) => !REL[rel].empty.includes(c) || u0().res.cells[c].v === "bad") as CellId[];
export const isOpen = (c: CellId) => { const v = u0().res.cells[c].v; return v === "cmp" || v === "open"; };
export const cases = (n: number) => (n === 1 ? "one case" : n + " cases");
function ResultStep() {
  const u = u0(), p = pairOf(), r = u.res, rel = relOf();
  const rows = resultRows(rel), unc = rows.filter(isOpen).length, nbad = rows.filter((c) => r.cells[c].v === "bad").length, nex = rows.filter((c) => !REL[rel].empty.includes(c)).length;
  const ov: string = r.overall, v = ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right", bad: "Not quite" } as Record<string, string>)[ov] || "Not quite";
  const vsub = (ov === "pend" ? unc + " unchecked" + (u.ctl ? " · the tutor is on it" : "") : ov === "ok" ? "your relation and " + (nex === 1 ? "one example" : nex + " examples")
    : ov === "part" ? cases(nbad) + " to look at" : u.late ? "time ran out on the relation" + (nbad ? "; " + cases(nbad) + " to look at" : "") : "the relation" + (nbad ? " and " + cases(nbad) : "")) + (u.exLate ? " · time ran out on the examples" : "");
  return <>
    <Scroll>
      <PairResult mine={rel} ok={!!r.relOk} right={p.relation} none={u.late ? "no relation" : undefined} />
      <Verdict v={v} word={word} sub={vsub} />
      <Sx cls={nbad ? "nop" : "okp"}><Gap h={2} />{rows.map((c) => <Row c={c} rel={rel} />)}</Sx>
      <WhyRow unc={unc} again={!!r.relOpen} />
      <TermsRow p={p} />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextFwd().label} act={() => next()} /></Foot>
  </>;
}

/** The screen of Relations: its top bar and the step the attempt is at. */
export function relationsScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0(), step = u.checked ? 3 : !u.rel || u.open ? 1 : 2;
  const top = <TopBar title="Relations" tools mic tutor={tutorOnResult()} tutorDot={tutorWaiting()} />;
  if (step === 1) return { cls: "", node: <>{top}<PickStep kb={kb} /></> };
  if (step === 2) return { cls: examplesReady() ? "ready" : "", node: <>{top}<ExamplesStep kb={kb} title="Relations" step={2} rel={relOf()} full={<Picked />} check={check} /></> };
  return { cls: "done", node: <>{top}<ResultStep /></> };
}
