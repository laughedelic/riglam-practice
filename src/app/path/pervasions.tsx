// Pervasions on the Path: 1 the questions (the four statements of the challenger one at a time, each accepted or answered with Why? and a
// counter-example; the ones answered stay on the path above), 2 the relation the answers give (the five as choices: picking one checks),
// 3 the result (the pair with the relation marked, the verdict, a row for each question, the tutor's Why, the terms). The steps are the
// classic page's (debate/flow.js), and so is the wording of the questions (debate/text.js, picked in the practice options).
import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { state } from "../state.js";
import { REL, lcRel } from "../core/rel.js";
import { backWhy, chooseD, sayQ, submitWhy } from "../debate/flow.js";
import { QCELL, Wd, singular } from "../debate/text.js";
import { guided } from "../practice/guided.ts";
import { next } from "../practice/queue.js";
import { explainParts, learnedThing, nextFwd } from "../practice/screen.js";
import { NOT, qSides } from "../../ai-shared/debate.ts";
import type { QToken } from "../../ai-shared/debate.ts";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { gradeDebate } from "../../domain/grading.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ScanPlan } from "./scan.tsx";
import { refreshPath } from "./index.tsx";
import { Choices, ErrLines, GuideNote, PairResult, PairStops, StageOffer, Thinking, TutorNote, Verdict, WhyRow, isa, pairOf, pickThen, u0 } from "./parts.tsx";
import { leftOpen, relChoices } from "./relations.tsx";
import { FlagBtn, FlagEditor, explainCase } from "./flags.tsx";
import { Scroll } from "./scroll.tsx";
import { nextName } from "./next.ts";
import { Foot, PreStation, PullCtx, SkipSide, Station, TopBar, VoiceBar } from "./shell.tsx";
import { Sub, markNames } from "./subjects.tsx";
import { D, Gap, Head, Icon, Mark, St, Sx, nofillInput } from "./ui.tsx";

interface Ans { say: "accept" | "why" | null; text: string; timeout?: boolean }

/** A statement of the challenger, with the pair's terms in the singular and its "not" set apart. It ends with no punctuation: the lead "Do you accept that…" above it asks, and read without the lead it
 *  is a statement, not a question (a wording that is a question itself, the plain one, keeps its own question mark). */
function Statement({ i }: { i: number }) {
  const p = pairOf(), q = Wd().q[i] as QToken[];
  return <>{q.map((x, k) => x === "A" || x === "B"
    ? <Sub k={x === "A" ? "a" : "b"}>{singular(x === "A" ? p.a : p.b)}</Sub>
    : x === NOT ? <b class="pnot">not</b> : k === q.length - 1 && x === "." ? null : x)}</>;
}
/** A question's number, in the margin left of its stop (Q1), and its concise form at the right (A → not B), on the first line of the row. */
function QHead({ i }: { i: number }) {
  const side = (t: QToken[]) => t.map((x) => x === NOT ? <><b class="pnot">not</b> </> : x), [l, r] = qSides(i);
  return <span class="qsymrow"><i class="qnm">Q{i + 1}</i><span class="qsym">{side(l)}<Icon n="arrow" cls="ar" />{side(r)}</span></span>;
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
      <St d={<D cls="sub yours" />} cls="sb done"><QHead i={i} /><Said a={a} />{on ? <p class="qq"><Statement i={i} /></p> : null}</St></button>;
  })}</>;
}

/* ---------- 1 the questions ---------- */
function QuestionStep({ kb }: { kb: boolean }) {
  const u = u0(), p = pairOf(), i: number = u.step, w = Wd(), retry = state.cur!.retry, last = i === 3, g = guided("debate");      // the guided form says what each answer does (practice/guided.ts)
  const items = [{ k: "accept", b: w.acc, s: g ? "it holds: nothing goes against it" : undefined, key: w.ak }, { k: "why", b: w.why, s: g ? "it fails: you posit a counter-example" : undefined, key: w.wk }];
  return <>
    <Scroll>
      {retry ? <p class="retry">{(state.cur!.tag || "Retry") + (state.retryQ.length ? " · " + state.retryQ.length + " more" : "")}</p> : null}
      <Sx cls="cur first tight"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Questions" sub={(i + 1) + " of 4 · " + (w.lead ? "do you accept it?" : "yes or no?")} /><Gap h={4} /><PairStops p={p} sm={i > 0} tags /><Gap h={4} />
        <Answered n={i} />
        {w.lead ? <p class="qlead above">{w.lead}</p> : null}
        <St d={<D cls="sub now" />} cls="sb now qnow"><QHead i={i} /><p class="qst" lang="en"><Statement i={i} /></p>
          {u.pickWhy ? <>
            <div class="fieldrow"><input class="pfield" id="dex" value={u.exText} placeholder="posit a counter-example" {...nofillInput()} enterKeyHint={last ? "done" : "next"} aria-label="Posit a counter-example"
              onInput={(e) => { u.exText = (e.currentTarget as HTMLInputElement).value; refreshPath(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitWhy(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); backWhy(); } }} /></div>
            <p class="help">{g ? <span class="htx">Something that shows the statement fails. </span> : null}<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={backWhy}>back</button></p>
          </> : null}</St>
        {u.pickWhy ? <Gap h={6} /> : null}</Sx>
      {u.pickWhy ? null : <Choices label="Your answer" slide row items={items} picked={u.pk} onPick={(k) => pickThen(k, () => sayQ(k))} />}
      {i < 3 ? <Sx cls="gap later">{[...Array(3 - i).keys()].map((j) => <St d={<D cls="sub" />} cls="sb later qmr"><QHead i={i + 1 + j} /></St>)}</Sx> : null}
      <Sx cls={"ptail" + (i < 3 ? " dtail" : "")} />
    </Scroll>
    <VoiceBar />
    {kb ? null : <Foot aux={<SkipSide />}>
      {u.pickWhy && (u.exText || "").trim() ? <Station kind="ex" name={last ? "Relation" : "Next question"} hint="your counter-example" act={submitWhy} />
        : <PreStation name={u.pickWhy && !last ? "Next question" : "Relation"} hint={u.pickWhy ? "posit a counter-example first" : last ? "answer this question first" : "answer the four questions first"} />}
    </Foot>}
  </>;
}

/* ---------- 2 the relation ---------- */
function RelationStep() {
  const u = u0(), p = pairOf(), pull = useContext(PullCtx);
  return <>
    <Scroll>
      <Sx cls="walked first tight"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Questions" sub="answered" /><Gap h={4} /><PairStops p={p} sm /><Gap h={4} /><Answered n={4} /><Gap h={8} /></Sx>
      <Sx cls="cur"><Head d={<D cls="sec now" />} h="2 Relation" sub="which relation do your answers give?" /><Gap h={4} /></Sx>
      <Choices label="Relation" slide items={relChoices(p, u.rel || null)} picked={u.pk} onPick={(k) => pickThen(k, () => chooseD(k), (act) => pull.scanPick(() => scanPlan(k as RelKey), act))} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceBar />
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick the relation: that checks your answers" /></Foot>
  </>;
}

/* ---------- 3 the result ---------- */
// A question whose example's name leaves the cell's quality open (src/domain/vague.ts) is not unchecked: the page has asked for the word, and no one checks it. The
// result's line, which counts it among the unchecked ones, says it apart.
const leftN = (r: { cells: Record<string, { vague?: readonly string[] }> }) => QCELL.filter((c) => r.cells[c].vague).length;
function leftSub(sub: string, unc: number, n: number, ctl: boolean): string {
  if (!n) return sub;
  const head = sub.slice(0, sub.lastIndexOf(" · " + unc + " unchecked")), rest = unc - n;
  return head + (rest ? " · " + rest + " unchecked" + (ctl ? ", the tutor is on it" : "") : "") + " · " + leftOpen(n);
}
function QRow({ i }: { i: number }) {
  const u = u0(), p = pairOf(), r = u.res, c = QCELL[i] as CellId, rr = r.cells[c] as { v: string; msg: string[]; uns?: boolean; vague?: string[] }, a = u.ans![i] as Ans;
  const open = (rr.v === "cmp" && !rr.vague) || rr.v === "open", m = rr.v === "ok" ? "ok" : rr.v === "bad" ? "no" : "pt", busy = open && !!u.ctl;
  const tnote: string | undefined = (explainParts().cells as Record<string, string>)[c];
  const note = <><b>{rr.msg[0]}</b>{rr.msg[2] ? <i>{rr.msg[2]}</i> : null}{markNames(isa(rr.msg[1] || ""), p)}</>;
  return <St d={<D cls={"sub " + (busy ? "pthink" : m)} />} cls={"sb exr qres" + (tnote ? " tut" : "")}>
    <QHead i={i} /><p class="qq"><Statement i={i} /></p>
    <div class="line1"><Said a={a} />{busy ? null : <Mark m={m} />}</div>
    {tnote ? <TutorNote c={c} text={tnote} where={"pq" + c} flag={<FlagBtn c={explainCase(tnote, c, "Q" + (i + 1), learnedThing(c))} where={"pop:" + c} />} /> : <p class="xnote">{note}</p>}
    <FlagEditor where={"pop:" + c} />
    {busy ? <Thinking label="the tutor is checking" /> : null}
  </St>;
}
/** The verdict of a result `r` as the result's node says it: its color, its word and the line beside it, and how many of the questions were unchecked. */
function verdictOf(r: { cells: Record<string, { v: string }>; dec?: Record<string, boolean>; overall?: string; relOk?: boolean }): { v: "ok" | "no" | "pt"; word: string; sub: string; unc: number } {
  const u = u0(), decOk = QCELL.filter((c) => r.dec && r.dec[c]).length, unc = QCELL.filter((c) => r.cells[c].v === "cmp" || r.cells[c].v === "open").length;
  const ov: string = r.overall || "", v = ov === "bad" ? "no" : ov === "part" ? "pt" : "ok";
  const word = ov === "pend" ? "Right so far" : ({ ok: "Right", part: "Partly right", bad: "Not quite" } as Record<string, string>)[ov] || "Not quite";
  const sub = (u.late ? "time ran out on the relation" : "the relation " + (r.relOk ? "right" : "wrong")) + " · questions " + decOk + "/4" + (unc ? " · " + unc + " unchecked" + (u.ctl ? ", the tutor is on it" : "") : "");
  return { v, word, sub, unc };
}
/** What the scan of the relation picked marks on its way (scan.tsx): the four answered questions and the relation, as the page's rows in their order, and the result's. Graded as the check will
 *  grade them (src/domain), before the check itself, which comes when the scan is over. */
function scanPlan(k: RelKey): ScanPlan {
  const u = u0(), r = gradeDebate(state as unknown as DataIndex, state.cur!.p, { ans: u.ans!, rel: k, late: !!u.late }), m = (v: string) => v === "ok" ? "ok" : v === "bad" ? "no" : "pt";
  const { v, word, sub } = verdictOf(r);
  return { cases: [...QCELL.map((c) => m(r.cells[c].v)), r.relOk ? "ok" : "no"], rel: v, v, word, sub, stop: ".sx.walked.first .sechead", rows: ".sx.walked.first .sb.done, .chs .crow[data-pk]" };
}
function ResultStep() {
  const u = u0(), p = pairOf(), r = u.res, imp: RelKey | "bad" | null = r.implied || null;
  const { v, word, sub, unc } = verdictOf(r);
  const impTxt = imp === "bad" ? "your answers contradict each other. If no A is B, A cannot also be inside B (or B inside A), because that leaves one of them with no instances."
    : imp ? "your answers give " + lcRel(REL[imp].name) + (u.late ? ", and time ran out before you chose." : imp === u.rel ? "." : ", but you chose " + lcRel(REL[u.rel as RelKey].name) + ".") : "";
  return <>
    <Scroll>
      <PairResult mine={(u.rel || p.relation) as RelKey} ok={!!r.relOk} right={p.relation} none={u.late ? "no relation" : undefined} />
      <Verdict v={v} word={word} sub={leftSub(sub, unc, leftN(r), !!u.ctl)} />
      {imp ? <Sx cls="walked"><St d={<D cls={"sub " + (imp === u.rel ? "ok" : "no")} />} cls="sb exr implied"><span class="lab">from your answers</span><p class="xnote">{impTxt[0].toUpperCase() + impTxt.slice(1)}</p></St></Sx> : null}
      <Sx cls={QCELL.some((c) => r.cells[c].v === "bad") ? "nop" : "okp"}><Gap h={2} />{QCELL.map((_c, i) => <QRow i={i} />)}</Sx>
      <WhyRow unc={unc - leftN(r)} />
      <StageOffer />
      <GuideNote />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextName(nextFwd().label)} act={() => next()} /></Foot>
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
