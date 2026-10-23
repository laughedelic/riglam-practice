// Pervasions on the Path: 1 the questions (the four statements of the challenger one at a time, each accepted or answered with Why? and a
// counter-example; the ones answered stay on the path above), 2 the relation the answers give (the five as choices: picking one checks),
// 3 the result (the pair with the relation marked, the verdict, a row for each question, the tutor's Why, the terms). The steps are the
// classic page's (debate/flow.js), and so is the wording of the questions (debate/text.js, picked in the practice options).
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { REL, lcRel } from "../core/rel.js";
import { backWhy, chooseD, sayQ, submitWhy } from "../debate/flow.js";
import { QCELL, Wd, singular } from "../debate/text.js";
import { next } from "../practice/queue.js";
import { explainParts, learnedThing, nextFwd } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { NOT } from "../../ai-shared/debate.ts";
import type { QToken } from "../../ai-shared/debate.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { refreshPath } from "./index.tsx";
import { Choices, ErrLines, PairResult, PairStops, Thinking, TutorNote, Verdict, WhyRow, isa, pairOf, pickThen, u0 } from "./parts.tsx";
import { relChoices } from "./relations.tsx";
import { FlagBtn, FlagEditor, explainCase } from "./flags.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, PreStation, SideStation, Station, TopBar, VoiceBar } from "./shell.tsx";
import { Sub, markNames } from "./subjects.tsx";
import { D, Gap, Head, Mark, St, Sx, NOFILL } from "./ui.tsx";

interface Ans { say: "accept" | "why" | null; text: string; timeout?: boolean }

/** A statement of the challenger, with the pair's terms in the singular and its "not" set apart. */
function Statement({ i }: { i: number }) {
  const p = pairOf();
  return <>{(Wd().q[i] as QToken[]).map((x) => x === "A" || x === "B"
    ? <Sub k={x === "A" ? "a" : "b"}>{singular(x === "A" ? p.a : p.b)}</Sub>
    : x === NOT ? <b class="pnot">not</b> : x)}</>;
}
/** An answer, short: "Accepted", or "Why?!" and the counter-example posited. */
function Said({ a }: { a: Ans }) {
  const w = Wd();
  if (a.say === "accept") return <span class="pans nil">{w.acd}{a.timeout ? " · time ran out" : ""}</span>;
  if (a.say === "why") return <span class="pans"><span class="pwhy">{w.wyd}</span> {a.text || <span class="nil">no example</span>}</span>;
  return <span class="pans nil">time ran out</span>;
}
/** The questions answered: each a stop on the path, its statement open under it with a tap. */
function Answered({ n }: { n: number }) {
  const u = u0();
  return <>{Array.from({ length: n }, (_, i) => {
    const a = u.ans![i] as Ans, on = u.ro === i;
    return <button type="button" class="sbb" aria-expanded={on ? "true" : "false"} onClick={() => { u.ro = on ? null : i; refreshPath(); }}
      aria-label={"Question " + (i + 1) + ": " + (a.say === "accept" ? Wd().acd : a.say === "why" ? Wd().wyd + " " + a.text : "time ran out") + ". " + (on ? "Hide" : "Show") + " the statement"}>
      <St d={<D cls="sub yours" />} cls="sb done"><span class="lab">Question {i + 1}</span><Said a={a} />{on ? <p class="qq"><Statement i={i} /></p> : null}</St></button>;
  })}</>;
}

/* ---------- 1 the questions ---------- */
function QuestionStep({ kb }: { kb: boolean }) {
  const u = u0(), p = pairOf(), i: number = u.step, w = Wd(), retry = state.cur!.retry, last = i === 3;
  const items = [{ k: "accept", b: w.acc, s: "it holds: nothing goes against it", key: w.ak }, { k: "why", b: w.why, s: "it fails: you posit a counter-example", key: w.wk }];
  return <>
    <Scroll>
      {retry ? <p class="retry">{(state.cur!.tag || "Retry") + (state.retryQ.length ? " · " + state.retryQ.length + " more" : "")}</p> : null}
      <Sx cls="cur first tight"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Questions" sub={(i + 1) + " of 4 · " + (w.lead ? "do you accept it?" : "yes or no?")} /><Gap h={4} /><PairStops p={p} sm={i > 0} /><Gap h={4} />
        <Answered n={i} />
        <St d={<D cls="sub now" />} cls="sb now qnow"><span class="lab">Question {i + 1}</span>{w.lead ? <span class="qlead">{w.lead}</span> : null}<p class="qst" lang="en"><Statement i={i} /></p>
          {u.pickWhy ? <>
            <div class="fieldrow"><input class="pfield" id="dex" value={u.exText} placeholder="posit a counter-example" {...NOFILL} enterKeyHint={last ? "done" : "next"} aria-label="Posit a counter-example"
              onInput={(e) => { u.exText = (e.currentTarget as HTMLInputElement).value; refreshPath(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitWhy(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); backWhy(); } }} /></div>
            <p class="help"><span class="htx">Something that shows the statement fails. </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={backWhy}>back</button></p>
          </> : null}</St>
        {u.pickWhy ? <Gap h={6} /> : null}</Sx>
      {u.pickWhy ? null : <Choices label="Your answer" items={items} picked={u.pk} onPick={(k) => pickThen(k, () => sayQ(k))} />}
      {i < 3 ? <Sx cls="walked later">{[...Array(3 - i).keys()].map((j) => <St d={<D cls="sub" />} cls="sb later"><span class="lab">Question {i + 2 + j}</span></St>)}</Sx> : null}
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    {kb ? null : <Foot aux={<SideStation kind="skip" act={skipPair} />}>
      {u.pickWhy && (u.exText || "").trim() ? <Station name={last ? "Relation" : "Next question"} hint="your counter-example" act={submitWhy} />
        : <PreStation name={u.pickWhy && !last ? "Next question" : "Relation"} hint={u.pickWhy ? "posit a counter-example first" : last ? "answer this question first" : "answer the four questions first"} />}
    </Foot>}
  </>;
}

/* ---------- 2 the relation ---------- */
function RelationStep() {
  const u = u0(), p = pairOf();
  return <>
    <Scroll>
      <Sx cls="walked first tight"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Questions" sub="answered" /><Gap h={4} /><PairStops p={p} sm /><Gap h={4} /><Answered n={4} /><Gap h={8} /></Sx>
      <Sx cls="cur"><Head d={<D cls="sec now" />} h="2 Relation" sub="which relation do your answers give?" /><Gap h={4} /></Sx>
      <Choices label="Relation" items={relChoices(p, u.rel || null)} picked={u.pk} onPick={(k) => pickThen(k, () => chooseD(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    <Foot aux={<SideStation kind="skip" act={skipPair} />}><PreStation name="Result" hint="pick the relation: that checks your answers" /></Foot>
  </>;
}

/* ---------- 3 the result ---------- */
function QRow({ i }: { i: number }) {
  const u = u0(), p = pairOf(), r = u.res, c = QCELL[i] as CellId, rr = r.cells[c] as { v: string; msg: string[]; uns?: boolean }, a = u.ans![i] as Ans;
  const open = rr.v === "cmp" || rr.v === "open", m = rr.v === "ok" ? "ok" : rr.v === "bad" ? "no" : "pt", busy = open && !!u.ctl;
  const tnote: string | undefined = (explainParts().cells as Record<string, string>)[c];
  const note = <><b>{rr.msg[0]}</b>{rr.msg[2] ? <i>{rr.msg[2]}</i> : null}{markNames(isa(rr.msg[1] || ""), p)}</>;
  return <St d={<D cls={"sub " + (busy ? "pthink" : m)} />} cls={"sb exr qres" + (tnote ? " tut" : "")}>
    <span class="lab">Question {i + 1}</span><p class="qq"><Statement i={i} /></p>
    <div class="line1"><Said a={a} />{busy ? null : <Mark m={m} />}</div>
    {tnote ? <TutorNote c={c} text={tnote} where={"pq" + c} flag={<FlagBtn c={explainCase(tnote, c, "Q" + (i + 1), learnedThing(c))} where={"pop:" + c} />} /> : <p class="xnote">{note}</p>}
    <FlagEditor where={"pop:" + c} />
    {busy ? <Thinking label="the tutor is checking" /> : null}
  </St>;
}
function ResultStep() {
  const u = u0(), p = pairOf(), r = u.res, imp: RelKey | "bad" | null = r.implied || null;
  const decOk = QCELL.filter((c) => r.dec[c]).length, unc = QCELL.filter((c) => r.cells[c].v === "cmp" || r.cells[c].v === "open").length;
  const ov: string = r.overall, v = ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right", bad: "Not quite" } as Record<string, string>)[ov] || "Not quite";
  const sub = (u.late ? "time ran out on the relation" : "the relation " + (r.relOk ? "right" : "wrong")) + " · questions " + decOk + "/4" + (unc ? " · " + unc + " unchecked" + (u.ctl ? ", the tutor is on it" : "") : "");
  const impTxt = imp === "bad" ? "your answers contradict each other. If no A is B, A cannot also be inside B (or B inside A), because that leaves one of them with no instances."
    : imp ? "your answers give " + lcRel(REL[imp].name) + (u.late ? ", and time ran out before you chose." : imp === u.rel ? "." : ", but you chose " + lcRel(REL[u.rel as RelKey].name) + ".") : "";
  return <>
    <Scroll>
      <PairResult mine={(u.rel || p.relation) as RelKey} ok={!!r.relOk} right={p.relation} none={u.late ? "no relation" : undefined} />
      <Verdict v={v} word={word} sub={sub} />
      {imp ? <Sx cls="walked"><St d={<D cls={"sub " + (imp === u.rel ? "ok" : "no")} />} cls="sb exr implied"><span class="lab">from your answers</span><p class="xnote">{impTxt[0].toUpperCase() + impTxt.slice(1)}</p></St></Sx> : null}
      <Sx cls={QCELL.some((c) => r.cells[c].v === "bad") ? "nop" : "okp"}><Gap h={2} />{QCELL.map((_c, i) => <QRow i={i} />)}</Sx>
      <WhyRow unc={unc} />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextFwd().label} act={() => next()} /></Foot>
  </>;
}

/** The screen of Pervasions: its top bar and the step the attempt is at. */
export function pervasionsScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0();
  const top = <TopBar title="Pervasions" tools mic />;
  if (u.checked) return { cls: "done", node: <>{top}<ResultStep /></> };
  if (u.step > 3) return { cls: "", node: <>{top}<RelationStep /></> };
  return { cls: u.pickWhy && (u.exText || "").trim() ? "ready" : "", node: <>{top}<QuestionStep kb={kb} /></> };
}
