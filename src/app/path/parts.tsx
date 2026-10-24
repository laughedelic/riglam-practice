// The parts that more than one exercise on the Path draws: the pair at the head, the choices on the path, the verdict, the tutor's Why and the
// terms. The rules are the classic page's (src/domain, practice/, ai/): these draw the same attempt, `state.ui`, and call the same steps.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { state } from "../state.js";
import { ask } from "../ai/tutor.js";
import { quorumItem } from "../ai/quorum-panel.js";
import { canAsk } from "../core/ask.js";
import { REL } from "../core/rel.js";
import { singular } from "../debate/text.js";
import { favTarget, isFav, toggleFav } from "../practice/favorites.js";
import { skipAsks, skipNow, skipPair } from "../practice/skips.js";
import { explainParts, factParts, noteData } from "../practice/screen.js";
import { lineageOf } from "../practice/terms.js";
import { catByLabel } from "../practice/universe.js";
import { openChat } from "../shell/chat.js";
import { render } from "../shell/render.js";
import type { CellId, RelKey } from "../../ai-shared/relations.ts";
import { VERDICT_RE, parseFactLine } from "../../domain/verdict.ts";
import type { FactLine, NotePart } from "../../domain/verdict.ts";
import { takeChoice, bindSlide } from "./choose.ts";
import { refreshPath } from "./index.tsx";
import { FlagBtn, FlagEditor, QuorumPanel, explainCase } from "./flags.tsx";
import { currentLook } from "./look.ts";
import { turnAside } from "./shell.tsx";
import { Sub } from "./subjects.tsx";
import { DefCard, OneTerm, TermText } from "./terms.tsx";
import { D, Fig, Icon, Mark, St, Sx } from "./ui.tsx";

export const u0 = () => state.ui!;
export interface Pair { a: string; b: string; relation: RelKey; catA?: string | null; catB?: string | null; own?: boolean; ex?: Partial<Record<CellId, string>> }
export const pairOf = () => state.cur!.p as Pair;

/** The name of each case, as the lab writes it. */
export const CASE: Record<string, string> = { both: "both A and B", anb: "A, not B", bna: "B, not A", nei: "neither" };
/** What to name for a case: "Something that is an effect but not a thought." */
export function caseQ(c: CellId, p: Pair) {
  const a = <Sub k="a">{singular(p.a)}</Sub>, b = <Sub k="b">{singular(p.b)}</Sub>, K = (w: string) => <b class="conn">{w}</b>;
  return ({
    both: <>Name something that is {K("both")} {a} {K("and")} {b}.</>,
    anb: <>Something that is {a}, {K("but not")} {b}.</>,
    bna: <>Something that is {b}, {K("but not")} {a}.</>,
    nei: <>Something that is {K("neither")} {a} {K("nor")} {b}.</>,
  } as Record<string, ComponentChildren>)[c];
}
/** The star of the pair (or of the syllogism), beside it: pressed while it is a favorite. */
export function Star() {
  const p = favTarget(); if (!state.db || !p || p.own) return null;
  const on = isFav(p);
  return <button type="button" class={"pib fav pstar" + (on ? " on" : "")} aria-pressed={on ? "true" : "false"} aria-label={on ? "In favorites" : "Add to favorites"} onClick={() => toggleFav(p)}><Icon n="star" /></button>;
}
/** Whether Skip is drawn as an icon here: the look puts it under the favorites mark, and the attempt on screen is not checked yet. */
export const skipHere = () => { const u = state.ui; return currentLook().skipAt === "under" && !!u && state.mode === "quiz" && !u.checked && !!state.cur; };
/** Skip, an action on the pair like saving it: an icon under the favorites mark, no diamond. With nothing entered the page turns to the next one at once; with
 *  something entered it asks first (practice/skips.js). */
export function SkipMark() {
  if (!skipHere()) return null;
  const u = state.ui!, what = u.syllogism ? "this syllogism" : u.cats ? "this one" : u.inst ? "these categories" : "this pair";
  return <button type="button" class="pib pskip" aria-label={"Skip " + what} onClick={(e) => { if (skipAsks()) skipPair(); else turnAside((e.currentTarget as HTMLElement).closest(".main"), skipNow); }}><Icon n="skip" /></button>;
}
/** The classes of a stop that carries the favorites mark and Skip under it. */
export const marksCls = (star = true) => (star && state.db ? " hasstar" : "") + (skipHere() ? " hasskip" : "");
/** The two terms of the pair as the first stops: A and B in the margin, the star beside A; `sm` smaller, once they are not the question. */
export function PairStops({ p, sm = false }: { p: Pair; sm?: boolean }) {
  const c = sm ? " sm" : "";
  return <>
    <St d={<span class="ab">A</span>} cls={"pairst" + c + marksCls()}><Star /><SkipMark /><span class={"tn" + (p.a.length > 24 ? " long" : "")}>{p.a}</span></St>
    <St d={<span class="ab">B</span>} cls={"pairst" + c}><span class={"tn" + (p.b.length > 24 ? " long" : "")}>{p.b}</span></St>
  </>;
}
/** The pair with a relation as its node on the path: A on the upper line, B on the lower, like the figure's two diamonds, and the relation
 *  under them: its name spelled out, with the course's notation (MI, 3P, 4P, MX) in the margin below the A and B marks. */
export function PairNode({ rel, right, p = pairOf() }: { rel: RelKey; right?: ComponentChildren; p?: Pair }) {
  const long = Math.max(p.a.length, p.b.length) > 24;
  return <div class={"pn" + (long ? " long" : "")}><i class="pnm a">A</i><i class="pnm b">B</i><Fig k={rel} size="pnode" />
    <span class="pnl a"><i>A</i><b>{p.a}</b></span><span class="pnl b"><i>B</i><b>{p.b}</b></span>
    {right ? <span class="pnr">{right}</span> : null}<i class="pnc" title={REL[rel].gloss(p.a, p.b)}>{REL[rel].code}</i><span class="pnn" title={REL[rel].gloss(p.a, p.b)}><span class="rn">{REL[rel].name}</span></span></div>;
}
/** The class under a term of the pair at the result: "each is a form". */
function ClassOf({ label, cat, where }: { label: string; cat?: string | null; where: string }) {
  const li = lineageOf(cat || catByLabel(label)); if (!li) return null;
  const name: string | undefined = li.everyday ? li.names[0] : li.names[1]; if (!name) return null;
  const low = name.toLowerCase();
  return <small class="cls">each is {/^[aeiou]/.test(low) ? "an" : "a"} <OneTerm txt={low} term={name} where={where} /></small>;
}
/**
 * The pair at the head of a result, with the relation given and its verdict at the right: `mine` the relation named, `ok` whether it is the
 * right one (null while it is not settled), `right` the one it is, `none` what stands for a relation that was never picked.
 */
export function PairResult({ mine, ok, right, none, classes = true }: { mine: RelKey; ok: boolean | null; right?: RelKey; none?: string; classes?: boolean }) {
  const p = pairOf(), long = Math.max(p.a.length, p.b.length) > 24, name = (k: string) => REL[k as RelKey].name;
  const rv = ok === null ? <span class="rvl"><b class="yours">{name(mine)}</b><Mark m="pt" /></span>
    : ok ? <span class="rvl"><b class="yours">{name(mine)}</b><Mark m="ok" /></span>
    : <><span class="rvl"><s class="no">{none || name(mine)}</s><Mark m="no" /></span>{right ? <span class="rvl"><Fig k={right} size="xs" /><span class="fix">{name(right)}</span></span> : null}</>;
  return <Sx cls="walked first"><div style={{ height: "14px" }} />
    <div class={"pn res" + (long ? " long" : "") + (state.db && !p.own ? " rstar" : "")}><i class="pnm a">A</i><i class="pnm b">B</i><Fig k={mine} size="pnode" />
      <span class="pnl a"><i>A</i><span class="tw"><b>{p.a}</b>{classes ? <ClassOf label={p.a} cat={p.catA} where="pca" /> : null}</span></span>
      <span class="pnl b"><i>B</i><span class="tw"><b>{p.b}</b>{classes ? <ClassOf label={p.b} cat={p.catB} where="pcb" /> : null}</span></span>
      {state.db && !p.own ? <span class="pnr"><Star /></span> : null}<span class="pnn rv">{rv}</span>
      <div class="pndef"><DefCard where="pca" /><DefCard where="pcb" /></div></div><div style={{ height: "10px" }} /></Sx>;
}
/** A chain of terms with "is a" between them, small and italic (the grading writes them with a separator). */
export const isa = (s: string) => String(s).split("\uE000").flatMap((x, i) => (i ? [" ", <i class="pisa">{/^[aeiou]/i.test(x) ? "is an" : "is a"}</i>, " ", x] : [x]));

export interface Choice { k: string; b: ComponentChildren; s?: ComponentChildren; fig?: string; sym?: string; key?: string; pressed?: boolean; label?: string }
/**
 * The choices where the path breaks into a dotted gap: each a row with its mark on the line (a figure, or a small diamond). A tap answers at
 * once; `picked` is the one being taken (it stays lit while the others fade). `multi` rows are pressed and unpressed instead. With `slide` (and
 * the "slide" look) the marks stand beside the path and the one taken slides onto it, by a tap or a finger (choose.ts); `row` puts two short
 * options on one row.
 */
export function Choices({ label, items, picked = null, onPick, multi = false, slide = false, row = false }: { label: string; items: Choice[]; picked?: string | null; onPick: (k: string) => void; multi?: boolean; slide?: boolean; row?: boolean }) {
  const beside = slide && !multi && currentLook().take === "slide", two = beside && row;
  const ref = useRef<HTMLDivElement>(null), last = useRef(onPick); last.current = onPick;
  useEffect(() => (beside && ref.current ? bindSlide(ref.current, (k) => last.current(k)) : undefined), [beside]);
  return <Sx cls="gap"><span class="gapq" aria-hidden="true">?</span>
    {beside ? <><i class="thr2" /><i class="thr" /></> : null}
    <div ref={ref} class={"chs" + (picked ? " fading" : "") + (multi ? " multi" : "") + (beside ? " slide" : "") + (two ? " row2" : "")} role="group" aria-label={label}>{items.map((it) =>
      <button type="button" data-k={it.k} class={"crow" + (picked === it.k ? " picked" : "") + (it.pressed ? " on" : "")} aria-pressed={it.pressed ? "true" : "false"} aria-keyshortcuts={it.key}
        aria-label={it.label || (two && typeof it.b === "string" && typeof it.s === "string" ? it.b + ": " + it.s : undefined)} onClick={() => onPick(it.k)}>
        <span class="mc">{it.fig ? <Fig k={it.fig} /> : <D cls={"sub pk" + (it.pressed ? " yours" : "")} />}</span>
        <span class="ct"><b>{it.b}{it.sym ? <span class="rsym">{it.sym}</span> : null}</b>{it.s && !two ? <small>{it.s}</small> : null}</span>
      </button>)}</div></Sx>;
}
/** A choice taken: it slides onto the path where the choices are made so (choose.ts), else it is lit for a moment; then `go`. Nothing else is taken meanwhile. */
export function pickThen(k: string, go: () => void) {
  const u = u0(); if (u.pk) return;
  if (u.tq) { go(); return; }   // under a running Blitz clock it is taken at once, so that the moment is not counted
  u.pk = k;
  const end = () => { if (state.ui !== u) return; u.pk = null; go(); };
  if (takeChoice(k, end)) return;
  refreshPath(); setTimeout(end, 420);
}

/** The verdict on the path: a large diamond with its mark, the word, and what it is about. */
export function Verdict({ v, word, sub, children }: { v: "ok" | "no" | "pt"; word: string; sub?: string; children?: ComponentChildren }) {
  return <Sx cls={({ ok: "okp", no: "nop", pt: "ptp" } as Record<string, string>)[v] + " vband"}>
    <St d={<D cls={"big " + v} mark={v === "ok" ? "check" : v === "no" ? "cross" : "q"} />} cls={"pvline " + v}>{word}{sub ? <small class="vsub">{sub}</small> : null}</St>
    {children}</Sx>;
}
/** What could not be saved or set aside, under the result. */
export function ErrLines() {
  const u = state.ui, errs = [u && u.saveErr, state.favErr, state.skipErr].filter(Boolean) as string[];
  return <>{errs.map((e) => <p class="pnoteline bad perr">{e}</p>)}</>;
}

/* ---------- the tutor ---------- */
/** The tutor at work: three dots, one after the other, and the seconds. */
export function Thinking({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t0 = Date.now(), id = setInterval(() => { if (ref.current) ref.current.textContent = Math.floor((Date.now() - t0) / 1000) + "s"; }, 250);
    return () => clearInterval(id);
  }, []);
  return <div class="think" role="status"><span class="tk"><i /></span><span class="tt">{label}</span><span class="secs" ref={ref}>0s</span></div>;
}
export const needsKey = () => !canAsk() && !!state.unlock && !!state.unlock.tutor;
/** Asks the tutor to check the open examples and explain; without the Magic Key, its prompt first. */
export function askTutor(open = true) {
  const u = u0(); if (u.ctl) return;
  if (canAsk()) { if (open) u.pwhy = true; void ask(null, "explain"); return; }
  if (needsKey()) void Promise.resolve(state.unlock!.open()).then((taken) => { if (taken && state.ui === u && canAsk() && u.checked && !u.explained && !u.ctl) { if (open) u.pwhy = true; void ask(null, "explain"); } });
}
export function latestExplain() {
  const chat = u0().chat || [];
  for (let i = chat.length - 1; i >= 0; i--) { const t = chat[i]; if (t.role === "assistant" && t.kind === "explain") return t; }
  return null;
}
/** What a tutor's line on an example says, as steps like the classic page drew them: a line for each of the pair's two terms (it follows it is, or is
 *  not, that term, and why), and the conclusion when the example does not fit. "Take the example" is left out: the row shows it just above. */
function FactSteps({ f, where }: { f: FactLine; where: string }) {
  const parts = factParts(f) as NotePart[], t = noteData().terms, seen = new Set<string>();
  const steps = parts.filter((x) => x.kind === "term" || x.kind === "unsure"), ends = parts.filter((x): x is Extract<NotePart, { kind: "end" }> => x.kind === "end");
  const txt = (s: string, w: string) => <><TermText text={s} where={w} seen={seen} /></>;
  return <>
    <ul class="tsteps">{steps.map((x, k) => {
      const wr = where + "." + k + "r", ww = where + "." + k + "w";
      if (x.kind === "unsure") return <li><span class="fl">Whether it is </span><Sub k={x.side === "A" ? "a" : "b"}>{x.side === "A" ? t.a : t.b}</Sub><span class="fl"> is not settled</span>{x.say ? <>: {txt(x.say, wr)}</> : null}.<DefCard where={wr} /></li>;
      if (x.kind !== "term") return null;
      return <li><span class="fl">It follows it is </span>{x.not ? <><b class="pnot">not</b> </> : null}<Sub k={x.side === "A" ? "a" : "b"}>{x.side === "A" ? t.a : t.b}</Sub>
        {x.reason ? <>, because {txt(x.reason, wr)}</> : null}.<DefCard where={wr} />
        {x.why ? <span class="twhy">{txt(x.why, ww)}</span> : null}{x.why ? <DefCard where={ww} /> : null}</li>;
    })}</ul>
    {ends.map((x) => <p class="fend">{x.text}</p>)}
  </>;
}
/**
 * The tutor's note on one example, set apart from the learner's own answer above it: a small label, then the steps of its line (or its words, for a
 * line that has no steps); the flag is at the right of the label. `where` keys the terms it names, so that their definitions open under them.
 */
export function TutorNote({ c, text, where, flag }: { c: CellId; text: string; where: string; flag?: ComponentChildren }) {
  const f = (explainParts().facts as Record<string, FactLine | undefined>)[c];
  return <div class="tnote"><div class="tuth"><span class="tutn">the tutor</span>{flag}</div>
    {f ? <FactSteps f={f} where={where} /> : <><p class="tt"><TermText text={text} where={where} /></p><DefCard where={where} /></>}</div>;
}
// the tutor's explanation without its lines on the cases (those are on the cases' rows)
const CELL_LN = /^[-•*\s]*(?:\*\*)?(?:both|a not b|b not a|neither|q[1-4])(?:\*\*)?\s*:/i;
function WhyText() {
  const t = latestExplain(); if (!t || !t.content) return null;
  const w = "i" + (u0().chat || []).indexOf(t);
  const seen = new Set<string>(), out: ComponentChildren[] = [];
  String(t.content).split("\n").forEach((ln0: string, i: number) => {
    if (!ln0.trim() || CELL_LN.test(ln0.trim()) || parseFactLine(ln0)) return;
    const ln = ln0.replace(/^[-•*\s]+/, "").replace(/\*\*/g, "").replace(VERDICT_RE, "").trim(); if (!ln) return;
    const m = ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/), w = "pw" + i;
    out.push(<p class="whyt">{m ? <><b>{m[1]}:</b> <TermText text={m[2]} where={w} seen={seen} /></> : <TermText text={ln} where={w} seen={seen} />}</p>, <DefCard where={w} />);
  });
  const flag = t.pending ? null : <><span class="pflgrow"><FlagBtn c={explainCase(t.content)} where={w} word /></span><FlagEditor where={w} /></>;
  return out.length ? <><div class="tsay">{out}</div>{flag}</> : t.pending ? null : <><p class="whyt">The tutor's notes are on the rows above.</p>{flag}</>;
}
/**
 * The row of the tutor under a result: Why, and what it would do (`todo`, else check the `unc` open examples and explain, or explain). Open, the explanation,
 * Quorum's panel, and Stop, a follow-up, or (with `again`, a verdict still open after it) Ask again.
 */
export function WhyRow({ unc = 0, again = false, todo }: { unc?: number; again?: boolean; todo?: string }) {
  const u = u0();
  if (!canAsk() && !u.chat && !u.chatErr && !needsKey()) return null;
  const open = !!u.pwhy, t = latestExplain(), writing = !!u.ctl, q = quorumItem();
  const sub = writing ? "the tutor is writing" : u.explained ? "from the tutor" : needsKey() ? "needs the Magic Key" : todo || (unc ? "check the open " + (unc === 1 ? "example" : "examples") + " and explain" : "ask the tutor");
  const act = () => { if (!u.explained && !u.ctl) { askTutor(); return; } u.pwhy = !u.pwhy; render(); };
  return <Sx cls="walked">
    <button type="button" class={"wrow" + (open ? " open" : "")} aria-expanded={open ? "true" : "false"} onClick={act}><D cls={"sub " + (writing ? "pthink" : "tut")} />
      <span class="ct"><b>Why</b><span>{sub}</span></span><span class="arr"><Icon n="chev" /></span></button>
    {open ? <div class="wtext">
      {writing && !(t && t.content) ? <Thinking label="the tutor is reading your answer" /> : null}
      <WhyText />
      {u.chatErr ? <p class="terr">{u.chatErr}</p> : null}
      {q ? <QuorumPanel /> : null}
      <div class="tact">
        {writing ? <button type="button" class="pbtn" onClick={() => u.ctl && u.ctl.abort()}>Stop</button> : null}
        {!writing && canAsk() && u.explained ? <button type="button" class="pbtn" onClick={openChat}>Ask a follow-up</button> : null}
        {!writing && canAsk() && u.explained && again ? <button type="button" class="pbtn" onClick={() => askTutor()}>Ask again</button> : null}
      </div>
    </div> : null}
  </Sx>;
}
