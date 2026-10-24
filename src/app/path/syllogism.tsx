// Syllogisms on the Path, as the lab draws them: 1 the answer (the syllogism set on the path in its three parts, S, P and R in the margin,
// and the three replies as choices; after a right "there is no pervasion", a counter-example, which may be left out), 2 the result (the
// verdict, what was answered, the three checks as stops, the tutor's Why). The steps are the classic page's (syllogism/flow.js).
import type { ComponentChildren } from "preact";
import { state } from "../state.js";
import { next } from "../practice/queue.js";
import { backSyllogism, exampleSyllogism, keyOfReply, saySyllogism, shownSyllogism } from "../syllogism/flow.js";
import { REPLIES, syllogismPieces } from "../../domain/syllogism.ts";
import type { Reply, Syllogism } from "../../domain/syllogism.ts";
import { refreshPath } from "./index.tsx";
import { Choices, ErrLines, SkipMark, Star, marksCls, Verdict, WhyRow, pickThen, u0 } from "./parts.tsx";
import { Scroll } from "./scroll.tsx";
import { Foot, PreStation, SkipSide, Station, TopBar } from "./shell.tsx";
import { D, Gap, Head, Mark, St, Sx, nofillInput } from "./ui.tsx";

/** The replies as the choices say them, what each says in a few words, and (with "Show the structure") what each means in S, P and R. */
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
/** The syllogism on the path: S, P and R in the margin, a line each, and what the letters stand for. */
function Statement({ star = true }: { star?: boolean }) {
  const l = lines(shownSyllogism());
  return <>
    <St d={<span class="ab">S</span>} cls={"stm" + (star ? marksCls() : "")}>{star ? <><Star /><SkipMark /></> : null}<span class="cs" lang="en">{l.subject}</span></St>
    <St d={<span class="ab">P</span>} cls="stm"><span class="cs" lang="en">{l.predicate}</span></St>
    <St d={<span class="ab">R</span>} cls="stm"><span class="cs" lang="en">{l.reason}</span></St>
    <p class="plegend">S subject · P predicate · R reason</p>
  </>;
}

/* ---------- 1 the answer ---------- */
function AnswerStep() {
  const u = u0(), guide = !!state.syllogismGuide;
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
/** After a right "there is no pervasion": a thing that is the reason and is not the predicate; left empty, the result comes without one. */
function CounterStep({ kb }: { kb: boolean }) {
  const u = u0(), c = shownSyllogism(), some = !!(u.exText || "").trim();
  return <>
    <Scroll>
      <Sx cls="cur first"><Gap h={14} /><Head d={<D cls="sec done" />} h="1 Answer" sub="do you accept it?" /><Gap h={6} /><Statement /><Gap h={4} />
        <St d={<D cls="sub yours" />} cls="sylsaid"><span class="said"><b class="yours">{SAY.pervasion}</b><Mark m="ok" /></span><span class="pq">Right. Can you show it?</span></St>
        <St d={<D cls="sub now" />} cls="sb now"><span class="lab">a counter-example</span>
          <p class="qq">Name something that is <b class="conn">{c.reason}</b> and is not <b class="conn">{c.predicate}</b>.</p>
          <div class="fieldrow"><input class="pfield" id="sylex" value={u.exText} placeholder="a counter-example" {...nofillInput()} enterKeyHint="done"
            aria-label={"A counter-example: something that is " + c.reason + " and is not " + c.predicate}
            onInput={(e) => { u.exText = (e.currentTarget as HTMLInputElement).value; if (u.exNote) u.exNote = ""; refreshPath(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); exampleSyllogism(); } }} /></div>
          {u.exNote ? <p class="pnoteline" role="status">{u.exNote}</p> : null}
          <p class="help"><span class="htx">Or leave it empty to go on without one. </span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={backSyllogism}>back to the replies</button></p></St>
        <Gap h={6} /></Sx>
      <Sx cls="ptail" />
    </Scroll>
    {kb ? null : <Foot>
      <Station name="Result" hint={some ? "your reply and the counter-example" : "your reply, without a counter-example"} act={exampleSyllogism} />
    </Foot>}
  </>;
}

/* ---------- 2 the result ---------- */
// what a check is called, and what it comes to when it holds and when it does not (a check that does not hold is the fault to find, not a wrong answer)
const CHECKS: [k: "e" | "v" | "t", label: string, yes: string, no: string][] = [["e", "Reason", "established", "not established"], ["v", "Pervasion", "holds", "fails"], ["t", "Thesis", "true", "false"]];
function ResultStep() {
  const u = u0(), c = shownSyllogism(), g = u.grade, first = (CHECKS.find(([k]) => !c.checks[k].ok) || [])[0];
  const v = g.correct ? (u.overall === "part" ? "pt" : "ok") : "no";
  const word = g.correct ? (u.overall === "part" ? "Partly right" : "Right") : u.timeout ? "Time is up" : "Not quite";
  const sub = u.overall === "part" ? "the counter-example is not one" : u.ex && u.ex.v === "ok" ? "your reply and the counter-example" : undefined;
  const said: ComponentChildren = g.correct ? <b class="yours">{cap(SAID[g.said as Reply])}.</b>
    : g.said ? <><s class="no">{cap(SAID[g.said as Reply])}</s>; <span class="fix">{SAID[g.expected as Reply]}</span>.</>
    : <>No reply in time; it is <span class="fix">{SAID[g.expected as Reply]}</span>.</>;
  return <>
    <Scroll>
      <Sx cls="walked first"><Gap h={12} /><Statement /><Gap h={6} /></Sx>
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
      <ErrLines />
      <Sx cls="ptail" />
    </Scroll>
    <Foot><Station name="Next" hint="another syllogism" act={() => next()} /></Foot>
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
