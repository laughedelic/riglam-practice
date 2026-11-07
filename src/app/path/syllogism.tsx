// Syllogisms on the Path, as the lab draws them: 1 the answer (the syllogism set on the path in its three parts, S, P and R in the margin,
// and the three replies as choices; after "there is no pervasion", a counter-example, which may be left out), 2 the result (the
// verdict, what was answered, the three checks as stops, the tutor's Why). The steps are syllogism/flow.js's. A "there is no pervasion" holds its verdict:
// the counter-example is asked for whether the reply is right or not, and the scan of the result marks the reply after the example.
// With thesis first (the practice options) the answer has two sections: 1 Thesis (S and P alone, I accept or Why?) and, after Why?, 2 Reason (R under the Why?, and the
// two denials); an attempt that ends at the thesis has a result about the thesis alone. With Ask for a counter-example off, a right "there is no pervasion" offers the
// counter-example on the result, under the pervasion (the Design Lab "Syllogisms: thesis first").
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { guidance } from "../practice/guided.ts";
import { next } from "../practice/queue.js";
import { backSyllogism, counterText, exampleSyllogism, keyOfReply, lateExample, openLateExample, saySyllogism, shownSyllogism } from "../syllogism/flow.js";
import { DENIALS, REPLIES, THESIS_REPLIES, checksShown, endedAtThesis, gradeExample, reasonText, syllogismPieces, thesisAnswer, thesisPieces } from "../../domain/syllogism.ts";
import type { Piece, Reply, Syllogism, SyllogismResult, ThesisReply } from "../../domain/syllogism.ts";
import { refreshPath } from "./index.tsx";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import type { ScanPlan } from "./scan.tsx";
import { Choices, ErrLines, GuideNote, SkipMark, StageOffer, Star, marksCls, Verdict, WhyRow, pickThen, u0 } from "./parts.tsx";
import { Scroll } from "./scroll.tsx";
import { WaitStop } from "./wait.tsx";
import { nextKind, nextName } from "./next.ts";
import { Foot, PreStation, SkipSide, Station, TopBar, VoiceField } from "./shell.tsx";
import { D, Gap, Head, Mark, St, Sx, nofillInput } from "./ui.tsx";

/** The replies as the choices say them, and what each means: Detailed guidance says it with the syllogism's own words, Hints in S, P and R, None not at all (practice/guided.ts). */
const SAY: Record<Reply, string> = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" };
const MEANS: Record<Reply, string> = { accept: "S is R, and everything that is R is P", reason: "S is not R", pervasion: "Just because it is R, doesn't necessarily mean that it is P" };
/** The same with the syllogism's words in place of S, P and R: "a black frying pan is not metal". */
const SPELLED: Record<Reply, (c: Syllogism) => string> = {
  accept: (c) => c.subject + " is " + c.reason + ", and everything that is " + c.reason + " is " + c.predicate,
  reason: (c) => c.subject + " is not " + c.reason,
  pervasion: (c) => "just because it is " + c.reason + ", doesn't necessarily mean that it is " + c.predicate,
};
/** A reply inside a sentence: "There is no pervasion." */
const SAID: Record<Reply, string> = { accept: "I accept", reason: "the reason is not established", pervasion: "there is no pervasion" };
/** The replies to the thesis alone (thesis first), what each means in S and P, and the same in the syllogism's words, as for the three replies. */
const T_SAY: Record<ThesisReply, string> = { accept: "I accept", why: "Why?" };
const T_MEANS: Record<ThesisReply, string> = { accept: "S is P", why: "S is not P" };
const T_SPELLED: Record<ThesisReply, (c: Syllogism) => string> = { accept: (c) => c.subject + " is " + c.predicate, why: (c) => c.subject + " is not " + c.predicate };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Part = "subject" | "predicate" | "reason";
/** The sentence in three lines, one for each part, in the wording picked: the words before a part go with it, a stop right after it too. With `thesis` the thesis alone, S and P. */
function lines(c: Syllogism, thesis = false): Record<Part, string> {
  const out: Record<Part, string> = { subject: "", predicate: "", reason: "" };
  let lead = "", last: Part | null = null;
  const pieces: Piece[] = (thesis ? thesisPieces : syllogismPieces)(c, state.syllogismWording);
  for (const x of pieces) {
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
/** The syllogism on the path: S, P and R in the margin, a line each, and what the letters stand for. Its first line keeps the room of the Skip mark (`hasroom`) in every step, so that the lines break the same way once Skip is gone (the result). `keep`: the step that follows shows it again, so the ride (push.ts) leaves it in its place. `thesis`: the thesis alone, S and P (thesis first). */
function Statement({ star = true, keep = false, thesis = false }: { star?: boolean; keep?: boolean; thesis?: boolean }) {
  const l = lines(shownSyllogism(), thesis);
  return <>
    <St d={<span class="ab">S</span>} cls={"stm hasroom" + (star ? marksCls() : "")}>{star ? <><Star /><SkipMark /></> : null}<span class="cs" lang="en">{l.subject}</span></St>
    <St d={<span class="ab">P</span>} cls="stm"><span class="cs" lang="en">{l.predicate}</span></St>
    {thesis ? null : <St d={<span class="ab">R</span>} cls="stm"><span class="cs" lang="en">{l.reason}</span></St>}
    {guidance("syllogism") === "none" ? (keep ? <div data-keep={String(RESULT_TOP)} aria-hidden="true" /> : null)      // no legend at None: the statement's foot is marked all the same
      : <p class="plegend" data-keep={keep ? String(RESULT_TOP) : undefined}>{thesis ? "S subject · P predicate" : "S subject · P predicate · R reason"}</p>}
  </>;
}
/** Thesis first, once Why? is said: the thesis as it was asked, with the Why? under it. */
function ThesisAsked() {
  return <Sx cls="walked first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Thesis" sub="do you accept it?" /><Gap h={6} /><Statement thesis /><Gap h={4} />
    <St d={<D cls="sub yours" />} cls="sylwhy"><span class="said"><b class="yours">{T_SAY.why}</b></span></St><Gap h={4} /></Sx>;
}
/** Thesis first, after Why?: the reason, as the challenger gives it, on its own line under the Why?; `children` follow it in its section (the reply, at the counter-example). */
function ReasonPart({ cls = "cur", children }: { cls?: string; children?: ComponentChildren }) {
  return <Sx cls={cls}><Gap h={10} /><Head d={<D cls="sec now" />} h="2 Reason" sub="the reason or the pervasion?" /><Gap h={6} />
    <St d={<span class="ab">R</span>} cls="stm"><span class="cs" lang="en">{reasonText(shownSyllogism(), state.syllogismWording)}</span></St>
    {guidance("syllogism") === "none" ? null : <p class="plegend">R reason</p>}
    {children}{children ? null : <Gap h={10} />}</Sx>;
}

/* ---------- 1 the answer ---------- */
function AnswerStep() {
  const u = u0(), g = guidance("syllogism"), c = shownSyllogism();
  if (u.tf) return u.th === undefined ? <ThesisStep /> : <ReasonStep />;
  const items = REPLIES.map((r) => ({ k: r, b: SAY[r], s: g === "detailed" ? SPELLED[r](c) : g === "hints" ? MEANS[r] : undefined, key: keyOfReply(r) }));
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Answer" sub="do you accept it?" /><Gap h={6} /><Statement /><Gap h={10} /></Sx>
      <Choices label="Your reply" slide items={items} picked={u.pk} onPick={(k) => pickThen(k, () => saySyllogism(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceField />
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick an answer first" /></Foot>
  </>;
}
/** Thesis first, 1: the thesis alone, I accept or Why?. */
function ThesisStep() {
  const u = u0(), g = guidance("syllogism"), c = shownSyllogism();
  const items = THESIS_REPLIES.map((r) => ({ k: r, b: T_SAY[r], s: g === "detailed" ? T_SPELLED[r](c) : g === "hints" ? T_MEANS[r] : undefined, key: keyOfReply(r) }));
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Thesis" sub="do you accept it?" /><Gap h={6} /><Statement thesis /><Gap h={10} /></Sx>
      <Choices label="Your reply to the thesis" slide items={items} picked={u.pk} onPick={(k) => pickThen(k, () => saySyllogism(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceField />
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick an answer first" /></Foot>
  </>;
}
/** Thesis first, 2: after Why?, the reason, and the two denials. */
function ReasonStep() {
  const u = u0(), g = guidance("syllogism"), c = shownSyllogism();
  const items = DENIALS.map((r) => ({ k: r, b: SAY[r], s: g === "detailed" ? SPELLED[r](c) : g === "hints" ? MEANS[r] : undefined, key: keyOfReply(r) }));
  return <>
    <Scroll>
      <ThesisAsked />
      <ReasonPart />
      <Choices label="Your reply" slide items={items} picked={u.pk} onPick={(k) => pickThen(k, () => saySyllogism(k))} />
      <Sx cls="ptail" />
    </Scroll>
    <VoiceField />
    <Foot aux={<SkipSide />}><PreStation name="Result" hint="pick an answer first" /></Foot>
  </>;
}
/** After "there is no pervasion" (right or not, the verdict waits): a thing that is the reason and is not the predicate; left empty, the result comes without one. */
function CounterStep({ kb }: { kb: boolean }) {
  const u = u0(), c = shownSyllogism(), some = !!(u.exText || "").trim();
  const said = <St d={<D cls="sub yours" />} cls="sylsaid"><span class="said"><b class="yours">{SAY.pervasion}</b></span><span class="pq">Can you show it?</span></St>;
  return <>
    <Scroll>
      {/* the counter-example may stay empty, and the way on waits for it all the same: its piece of line is dotted until something is written (the pieces are the examples' `eh` and `er`) */}
      {u.tf ? <><ThesisAsked /><ReasonPart cls="cur eh"><Gap h={4} />{said}</ReasonPart></>
        : <Sx cls="cur first eh"><Gap h={14} /><Head d={<D cls="sec now" />} h="1 Answer" sub="do you accept it?" /><Gap h={6} /><Statement keep /><Gap h={4} />{said}</Sx>}
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
    <VoiceField kb={kb} />
    {kb ? null : <Foot>
      <Station kind="chk" name="Result" hint={some ? "your reply and the counter-example" : "your reply, without a counter-example"} act={exampleSyllogism} scan={scanPlan} />
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
  const shown = x && (guidance("syllogism") === "detailed" || shownSyllogism().answer !== "reason");     // as on the result: past Detailed a reason that fails says nothing of the counter-example
  const overall = g.correct && x && x.v === "bad" ? "part" : g.grade, { v, word, sub } = verdictOf(g, overall, !!u.timeout, shown ? x.v : null);
  return { cases: shown ? [x.v === "ok" ? "ok" : x.v === "bad" ? "no" : "pt"] : [], rel: g.correct ? "ok" : "no", v, word, sub: sub || "", stop: ".sylsaid" };
}
/** What was answered, as the result's lead says it: the reply, struck and put right when it was wrong. With thesis first, an attempt that ended at the thesis says the thesis
 *  reply, and one that went on says its Why? before the reply. */
function saidLine(c: Syllogism, g: SyllogismResult, thesisOnly: boolean): ComponentChildren {
  if (thesisOnly && !g.correct) {
    const right = thesisAnswer(c), fix = right === "accept" ? "I accept." : "why?";
    return g.thesis ? <><s class="no">{T_SAY[g.thesis]}</s>; <span class="fix">{fix}</span></> : <>No reply in time; it is <span class="fix">{fix}</span></>;
  }
  const why = g.thesis === "why" && !thesisOnly ? T_SAY.why + " " : "";
  return g.correct ? <b class="yours">{why}{cap(SAID[g.said as Reply])}.</b>
    : g.said ? <>{why ? <b class="yours">{why}</b> : null}<s class="no">{cap(SAID[g.said as Reply])}</s>; <span class="fix">{SAID[g.expected as Reply]}</span>.</>
    : <>{why ? <b class="yours">{why}</b> : null}No reply in time; it is <span class="fix">{SAID[g.expected as Reply]}</span>.</>;
}
/** The counter-example on the result, where it was not asked before it (Ask for a counter-example off): offered under the pervasion after a right "there is no pervasion", and
 *  once tapped, its field, which the station's Check (or Enter) checks. */
const LateOffer = () => <p class="help sylopt"><span class="htx">Can you show it? </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => openLateExample(true)}>name a counter-example</button></p>;
function LateField() {
  const u = u0(), c = shownSyllogism();
  return <St d={<D cls="sub now" />} cls="sb now sylate"><span class="lab">a counter-example</span>
    <p class="qq">Name something that is <b class="conn">{c.reason}</b> and is not <b class="conn">{c.predicate}</b>.</p>
    <div class="fieldrow"><input class="pfield" id="sylex" value={u.exText} placeholder="a counter-example" {...nofillInput()} enterKeyHint="done"
      aria-label={"A counter-example: something that is " + c.reason + " and is not " + c.predicate}
      onInput={(e) => { u.exText = (e.currentTarget as HTMLInputElement).value; if (u.exNote) u.exNote = ""; refreshPath(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lateExample(); } }} /></div>
    {u.exNote ? <p class="pnoteline" role="status">{u.exNote}</p> : null}
    <p class="help"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => openLateExample(false)}>never mind</button></p></St>;
}
function ResultStep() {
  const u = u0(), c = shownSyllogism(), g = u.grade, first = (CHECKS.find(([k]) => !c.checks[k].ok) || [])[0], level = guidance("syllogism"), full = level === "detailed";
  const thesisOnly = endedAtThesis(g), late = !!u.late && g.correct && !u.ex, writing = late && !!u.exOpen && !!(u.exText || "").trim();
  const { v, word, sub } = verdictOf(g, u.overall, !!u.timeout, u.ex && (full || c.answer !== "reason") ? u.ex.v : null);
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={RESULT_TOP} /><Statement thesis={thesisOnly} /><Gap h={6} /></Sx>
      <Verdict v={v} word={word} sub={sub}>
        <St d={<span />} cls="pwhat"><p class="plead">{saidLine(c, g, thesisOnly)}</p>{!g.correct && g.confusion && full ? <p class="conf">{g.confusion}</p> : null}</St>
      </Verdict>
      {/* the checks the level shows (src/domain/syllogism.ts, checksShown): all three at Detailed in the syllogism's words, past it the deciding one, with its formula at Hints;
          an attempt that ended at the thesis shows the thesis alone */}
      <Sx cls="walked">{checksShown(c, level, thesisOnly).map(({ k, line }) => {
        if (thesisOnly) {
          const ok = c.checks.t.ok, m = ok ? "ok" : "no";
          return <St d={<D cls={"sub " + (ok ? "ok" : "now")} />} cls={"chk " + m + " first"}><span class={"lab2 " + m}>Thesis · {ok ? "true" : "false"}</span>
            {line ? <p>{full ? c.checks.t.line : T_MEANS[thesisAnswer(c)] + "."}</p> : null}</St>;
        }
        // the learner's counter-example goes with the pervasion; past Detailed under the one check shown, but not under a reason that fails, where its verdict would tell whether the pervasion holds
        const here = full ? k === "v" : k !== "e";
        const mine = u.ex && here ? <p class="mine"><Mark m={u.ex.v === "ok" ? "ok" : u.ex.v === "bad" ? "no" : "pt"} /><b>Your counter-example:</b> {u.ex.text}. {u.ex.line}</p>
          : late && here && !u.exOpen ? <LateOffer /> : null;
        const text = !line ? null : <p>{full && k !== "whole" ? c.checks[k].line : MEANS[c.answer] + "."}</p>;
        if (k === "whole") return <St d={<D cls="sub ok" />} cls="chk ok first"><span class="lab2 ok">Syllogism · correct</span>{text}{mine}</St>;
        const [, label, yes, no] = CHECKS.find(([x]) => x === k)!;
        const ok = c.checks[k].ok, thesis = k === "t", m = thesis ? (c.answer === "accept" ? "ok" : "e") : ok ? "ok" : "no";
        const word2 = thesis && c.answer === "accept" ? "follows" : ok ? yes : no;
        return <>
          <St d={<D cls={"sub " + (m === "ok" ? "ok" : m === "no" ? "now" : "")} />} cls={"chk " + m + (k === first ? " first" : "")}>
            <span class={"lab2 " + m}>{label} · {word2}</span>{text}{mine}
          </St>
          {late && here && u.exOpen ? <LateField /> : null}
        </>;
      })}</Sx>
      <WhyRow />
      <StageOffer />
      <GuideNote />
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <WaitStop />
    <Foot>{writing ? <Station kind="chk" name="Check" hint="your counter-example" act={lateExample} />
      : <Station name={nextName("Next syllogism")} kind={nextKind()} act={() => next()} wait={!!u.ctl} />}</Foot>
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
