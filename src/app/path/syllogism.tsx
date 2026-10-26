// Syllogisms on the Path, as the lab draws them: 1 the answer (the syllogism set on the path in its three parts, S, P and R in the margin,
// and the three replies as choices; after "there is no pervasion", a counter-example, which may be left out), 2 the result (the
// verdict, what was answered, the three checks as stops, the tutor's Why). The steps are the classic page's (syllogism/flow.js). A "there is no pervasion" holds its verdict:
// the counter-example is asked for whether the reply is right or not, and the scan of the result marks the reply after the example.
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { guided } from "../practice/guided.ts";
import { next } from "../practice/queue.js";
import { backSyllogism, counterText, exampleSyllogism, keyOfReply, saySyllogism, shownSyllogism } from "../syllogism/flow.js";
import { REPLIES, gradeExample, syllogismPieces } from "../../domain/syllogism.ts";
import type { Reply, Syllogism } from "../../domain/syllogism.ts";
import { refreshPath } from "./index.tsx";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ScanPlan } from "./scan.tsx";
import { Choices, ErrLines, GuideNote, SkipMark, StageOffer, Star, marksCls, Verdict, WhyRow, pickThen, u0 } from "./parts.tsx";
import { Scroll } from "./scroll.tsx";
import { nextName } from "./next.ts";
import { Foot, PreStation, SkipSide, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Mark, St, Sx, nofillInput } from "./ui.tsx";

/** The replies as the choices say them, what each says in a few words, and (in the guided form, practice/guided.ts) what each means in S, P and R. */
const SAY: Record<Reply, string> = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" };
const GLOSS: Record<Reply, string> = { accept: "the reason holds and it pervades", reason: "the subject is not the reason", pervasion: "the reason does not bring the predicate" };
const MEANS: Record<Reply, string> = { accept: "S is R, and everything that is R is P", reason: "S is not R", pervasion: "S is R, but not everything that is R is P" };
/** A reply inside a sentence: "There is no pervasion." */
const SAID: Record<Reply, string> = { accept: "I accept", reason: "the reason is not established", pervasion: "there is no pervasion" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Part = "subject" | "predicate" | "reason";
/** The sentence in three lines, one for each part, in the wording picked: the words before a part go with it, a stop right after it too. */
function lines(c: Syllogism): Record<Part, string> {
  const out: Record<Part, string> = { subject: "", predicate: "", reason: "" };
  let lead = "", last: Part | null = null;
  for (const x of syllogismPieces(c, state.syllogismWording)) {
    if (typeof x !== "string") { out[x.part] = lead + x.text; lead = ""; last = x.part; continue; }
    const m = /^([.,;:!?]*)\s*([\s\S]*)$/.exec(x)!;
    if (last && m[1]) out[last] += m[1];
    lead += last ? m[2] : x;
  }
  if (last && lead.trim()) out[last] += " " + lead.trim();
  return out;
}
/** How far under the top of its section the result puts the statement (px): the ride (push.ts) folds what is above the statement down to this, so that the statement does not move when the result comes. */
const RESULT_TOP = 12;
/** The syllogism on the path: S, P and R in the margin, a line each, and what the letters stand for. Its first line keeps the room of the Skip mark (`hasroom`) in every step, so that the lines break the same way once Skip is gone (the result). `keep`: the step that follows shows it again, so the ride (push.ts) leaves it in its place. */
function Statement({ star = true, keep = false }: { star?: boolean; keep?: boolean }) {
  const l = lines(shownSyllogism());
  return <>
    <St d={<span class="ab">S</span>} cls={"stm hasroom" + (star ? marksCls() : "")}>{star ? <><Star /><SkipMark /></> : null}<span class="cs" lang="en">{l.subject}</span></St>
    <St d={<span class="ab">P</span>} cls="stm"><span class="cs" lang="en">{l.predicate}</span></St>
    <St d={<span class="ab">R</span>} cls="stm"><span class="cs" lang="en">{l.reason}</span></St>
    <p class="plegend" data-keep={keep ? String(RESULT_TOP) : undefined}>S subject · P predicate · R reason</p>
  </>;
}

/* ---------- 1 the answer ---------- */
function AnswerStep() {
  const u = u0(), guide = guided("syllogism");
  const items = REPLIES.map((r) => ({ k: r, b: SAY[r], s: guide ? MEANS[r] : GLOSS[r], key: keyOfReply(r) }));
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Answer" sub="do you accept it?" /><Gap h={6} /><Statement /><Gap h={10} /></Sx>
      <Choices label="Your reply" slide items={items} picked={u.pk} onPick={(k) => pickThen(k, () => saySyllogism(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick an answer first" /></Foot>
  </>;
}
/** After "there is no pervasion" (right or not, the verdict waits): a thing that is the reason and is not the predicate; left empty, the result comes without one. */
function CounterStep({ kb }: { kb: boolean }) {
  const u = u0(), c = shownSyllogism(), some = !!(u.exText || "").trim();
  return <>
    <Scroll>
      {/* the counter-example may stay empty, and the way on waits for it all the same: its piece of line is dotted until something is written (the pieces are the examples' `eh` and `er`) */}
      <Sx cls="cur first eh"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Answer" sub="do you accept it?" /><Gap h={6} /><Statement keep /><Gap h={4} />
        <St d={<D cls="sub yours" />} cls="sylsaid"><span class="said"><b class="yours">{SAY.pervasion}</b></span><span class="pq">Can you show it?</span></St></Sx>
      <Sx cls={(some ? "cur" : "gap") + " er last"}>
        <St d={<D cls="sub now" />} cls="sb now"><span class="lab">a counter-example</span>
          <p class="qq">Name something that is <b class="conn">{c.reason}</b> and is not <b class="conn">{c.predicate}</b>.</p>
          <div class="fieldrow"><input class="pfield" id="sylex" value={u.exText} placeholder="a counter-example" {...nofillInput()} enterKeyHint="done"
            aria-label={"A counter-example: something that is " + c.reason + " and is not " + c.predicate}
            onInput={(e) => { u.exText = (e.currentTarget as HTMLInputElement).value; if (u.exNote) u.exNote = ""; refreshPath(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); exampleSyllogism(); } }} /></div>
          {u.exNote ? <p class="pnoteline" role="status">{u.exNote}</p> : null}
          <p class="help"><span class="htx">Or leave it empty to go on without one. </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={backSyllogism}>back to the replies</button></p></St>
        <Gap h={6} /></Sx>
      <Sx cls={"ptail" + (some ? "" : " dtail")} />
    </Scroll>
    {kb ? null : <Foot>
      <Station name="Result" hint={some ? "your reply and the counter-example" : "your reply, without a counter-example"} act={exampleSyllogism} scan={scanPlan} />
    </Foot>}
  </>;
}

/* ---------- 2 the result ---------- */
// what a check is called, and what it comes to when it holds and when it does not (a check that does not hold is the fault to find, not a wrong answer)
const CHECKS: [k: "e" | "v" | "t", label: string, yes: string, no: string][] = [["e", "Reason", "established", "not established"], ["v", "Pervasion", "holds", "fails"], ["t", "Thesis", "true", "false"]];
/** The verdict as the result's node says it: its color, its word and the line beside it, for the reply graded `g`, the overall grade and the counter-example's verdict `ex` (if one was given). */
function verdictOf(g: { correct: boolean }, overall: string, timeout: boolean, ex: string | null): { v: "ok" | "no" | "pt"; word: string; sub?: string } {
  return {
    v: g.correct ? (overall === "part" ? "pt" : "ok") : "no",
    word: g.correct ? (overall === "part" ? "Partly right" : "Right") : timeout ? "Time is up" : "Not quite",
    sub: overall === "part" ? "the counter-example is not one" : ex === "ok" ? "your reply and the counter-example" : undefined,
  };
}
/** What the scan of the Result marks on its way up (scan.tsx): the counter-example, if one is written, then the reply, which the scanner stops at and becomes the result's node on. Graded as the
 *  check will grade them (src/domain), before the check itself, which comes when the scan is over. None when the check will not go on (the subject itself is no counter-example). */
function scanPlan(): ScanPlan | null {
  const u = u0(), g = u.grade, t = counterText(u), x = t ? gradeExample(state as unknown as DataIndex, shownSyllogism(), t) : null;
  if (!g || (x && x.v === "self")) return null;
  const overall = g.correct && x && x.v === "bad" ? "part" : g.grade, { v, word, sub } = verdictOf(g, overall, !!u.timeout, x ? x.v : null);
  return { cases: x ? [x.v === "ok" ? "ok" : x.v === "bad" ? "no" : "pt"] : [], rel: g.correct ? "ok" : "no", v, word, sub: sub || "", stop: ".sylsaid" };
}
function ResultStep() {
  const u = u0(), c = shownSyllogism(), g = u.grade, first = (CHECKS.find(([k]) => !c.checks[k].ok) || [])[0];
  const { v, word, sub } = verdictOf(g, u.overall, !!u.timeout, u.ex ? u.ex.v : null);
  const said: ComponentChildren = g.correct ? <b class="yours">{cap(SAID[g.said as Reply])}.</b>
    : g.said ? <><s class="no">{cap(SAID[g.said as Reply])}</s>; <span class="fix">{SAID[g.expected as Reply]}</span>.</>
    : <>No reply in time; it is <span class="fix">{SAID[g.expected as Reply]}</span>.</>;
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={RESULT_TOP} /><Statement /><Gap h={6} /></Sx>
      <Verdict v={v} word={word} sub={sub}>
        <St d={<span />} cls="pwhat"><p class="plead">{said}</p>{!g.correct && g.confusion ? <p class="conf">{g.confusion}</p> : null}</St>
      </Verdict>
      <Sx cls="walked">{CHECKS.map(([k, label, yes, no]) => {
        const ok = c.checks[k].ok, thesis = k === "t", m = thesis ? (c.answer === "accept" ? "ok" : "e") : ok ? "ok" : "no";
        const word2 = thesis && c.answer === "accept" ? "follows" : ok ? yes : no;
        return <St d={<D cls={"sub " + (m === "ok" ? "ok" : m === "no" ? "now" : "")} />} cls={"chk " + m + (k === first ? " first" : "")}>
          <span class={"lab2 " + m}>{label} · {word2}</span><p>{c.checks[k].line}</p>
          {k === "v" && u.ex ? <p class="mine"><Mark m={u.ex.v === "ok" ? "ok" : u.ex.v === "bad" ? "no" : "pt"} /><b>Your counter-example:</b> {u.ex.text}. {u.ex.line}</p> : null}
        </St>;
      })}</Sx>
      <WhyRow />
      <StageOffer />
      <GuideNote />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name={nextName("Next syllogism")} act={() => next()} /></Foot>
  </>;
}

/** The screen of Syllogisms: its top bar and the step the attempt is at. */
export function syllogismScreen(kb: boolean): { cls: string; node: ComponentChildren } {
  const u = u0();
  const top = <TopBar title="Syllogisms" tools />;
  if (u.checked) return { cls: "done", node: <>{top}<ResultStep /></> };
  if (u.step === 1) return { cls: "ready", node: <>{top}<CounterStep kb={kb} /></> };
  return { cls: "", node: <>{top}<AnswerStep /></> };
}
